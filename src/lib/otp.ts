import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { q } from "./db";
import { mailKind, sendMailOne } from "./mailer";

/**
 * Login dengan kode 6 digit yang dikirim ke email (tanpa tautan, supaya email tidak dianggap spam).
 * Kode berlaku 10 menit dan sekali pakai; yang disimpan di database hanya hash HMAC-nya.
 */
export const OTP_COOKIE = "am_otp";
export const OTP_TTL_MIN = 10;
const RESEND_COOLDOWN_S = 60;
const MAX_ATTEMPTS = 5;
const MAX_SENDS = 5;
const MAX_PER_EMAIL = 5; // per 15 menit
const MAX_PER_IP = 15;

export class OtpError extends Error {
  constructor(
    public status: number,
    message: string,
    public restart = false,
  ) {
    super(message);
  }
}

const secret = () => process.env.AUTH_SECRET || "dev-insecure-secret-change-me";
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const randomToken = () => randomBytes(32).toString("base64url");
const newCode = () => String(randomInt(0, 1_000_000)).padStart(6, "0");
const codeHash = (id: string, code: string) => createHmac("sha256", secret()).update(`${id}:${code}`).digest("hex");
const safeEqualHex = (a: string, b: string) => {
  const x = Buffer.from(a, "hex");
  const y = Buffer.from(b, "hex");
  return x.length === y.length && timingSafeEqual(x, y);
};

/** Login kode email bisa dipakai bila ada jalur pengiriman email. */
export const otpAvailable = () => mailKind() !== null;
/** OTP_ONLY=1: login password dimatikan, hanya kode email. */
export const otpOnly = () => process.env.OTP_ONLY === "1";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Email sengaja polos: hanya kode, tanpa tautan atau tombol (email berisi tautan lebih sering masuk spam). */
async function mailCode(to: string, name: string, code: string) {
  const html = `<!doctype html><html><body style="margin:0;background:#ffffff;padding:24px 12px;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;color:#1f1e1d">
<div style="max-width:420px;margin:0 auto">
<p style="font-size:15px;line-height:1.6;margin:0 0 14px">Halo ${esc(name)},</p>
<p style="font-size:15px;line-height:1.6;margin:0 0 14px">Kode masuk Ads Manager Anda:</p>
<p style="font-family:'Courier New',monospace;font-size:32px;letter-spacing:8px;font-weight:bold;margin:0 0 14px">${code}</p>
<p style="font-size:14px;line-height:1.6;margin:0 0 14px;color:#5e5d59">Kode berlaku ${OTP_TTL_MIN} menit dan hanya bisa dipakai sekali. Jangan berikan kode ini kepada siapa pun.</p>
<p style="font-size:13px;line-height:1.6;margin:0;color:#8a8880">Jika Anda tidak meminta kode ini, abaikan email ini.</p>
</div></body></html>`;
  await sendMailOne({
    to,
    subject: `${code} adalah kode masuk Ads Manager Anda`,
    html,
    text: `Halo ${name},\n\nKode masuk Ads Manager Anda: ${code}\n\nKode berlaku ${OTP_TTL_MIN} menit dan hanya bisa dipakai sekali. Jangan berikan kode ini kepada siapa pun.\nJika Anda tidak meminta kode ini, abaikan email ini.`,
  });
}

/** Cegah email/IP dibanjiri kode dan beri jeda antar-permintaan. Setiap permintaan dicatat (termasuk email yang tidak terdaftar, supaya tidak bisa dibedakan). */
async function guard(email: string, ip: string | null) {
  const [a] = await q<{ n: number; wait: number }>(
    `SELECT count(*)::int AS n,
            COALESCE(GREATEST(0, ceil(extract(epoch FROM (max(at) + ($2 || ' seconds')::interval - now())))), 0)::int AS wait
       FROM otp_sends WHERE email = $1 AND at > now() - interval '15 minutes'`,
    [email, String(RESEND_COOLDOWN_S)],
  );
  if (a.wait > 0) throw new OtpError(429, `Tunggu ${a.wait} detik sebelum meminta kode lagi.`);
  const [b] = ip ? await q<{ n: number }>(`SELECT count(*)::int AS n FROM otp_sends WHERE ip = $1 AND at > now() - interval '15 minutes'`, [ip]) : [{ n: 0 }];
  if (a.n >= MAX_PER_EMAIL || b.n >= MAX_PER_IP) throw new OtpError(429, "Terlalu banyak permintaan kode. Coba lagi dalam 15 menit.");
  await q(`INSERT INTO otp_sends (email, ip) VALUES ($1, $2)`, [email, ip]);
  await q(`DELETE FROM otp_sends WHERE at < now() - interval '1 day'`);
}

/**
 * Minta kode. Mengembalikan ID tantangan (disimpan di cookie). Untuk email yang tidak terdaftar tetap dikembalikan ID palsu
 * dan tidak ada email dikirim, jadi pihak luar tidak bisa mengecek siapa saja yang punya akun.
 */
export async function startOtp(emailRaw: string, ip: string | null): Promise<string> {
  const email = emailRaw.trim().toLowerCase();
  await guard(email, ip);
  const id = randomToken();
  const [u] = await q<{ id: number; name: string; email: string }>(`SELECT id, name, email FROM users WHERE email = $1`, [email]);
  if (!u) return id;
  const code = newCode();
  await q(`DELETE FROM login_otps WHERE user_id = $1`, [u.id]);
  await q(`INSERT INTO login_otps (id_hash, user_id, otp_hash, expires_at) VALUES ($1, $2, $3, now() + ($4 || ' minutes')::interval)`, [sha256(id), u.id, codeHash(id, code), String(OTP_TTL_MIN)]);
  await mailCode(u.email, u.name, code);
  return id;
}

interface Challenge {
  id_hash: string;
  user_id: number;
  otp_hash: string;
  expired: boolean;
  attempts: number;
  sends: number;
}
const byId = async (id: string) =>
  (await q<Challenge>(`SELECT id_hash, user_id, otp_hash, expires_at < now() AS expired, attempts, sends FROM login_otps WHERE id_hash = $1`, [sha256(id)]))[0];

const RESTART = "Sesi kode tidak ditemukan. Silakan minta kode baru.";

/** Cocokkan kode. Mengembalikan userId bila benar (dan menghapus kodenya: sekali pakai). */
export async function verifyOtp(id: string | undefined, codeRaw: string): Promise<number> {
  if (!id) throw new OtpError(400, RESTART, true);
  const c = await byId(id);
  if (!c) throw new OtpError(400, RESTART, true);
  if (c.expired) throw new OtpError(400, "Kode sudah kedaluwarsa. Kirim ulang kode.");
  if (c.attempts >= MAX_ATTEMPTS) {
    await q(`DELETE FROM login_otps WHERE id_hash = $1`, [c.id_hash]);
    throw new OtpError(429, "Terlalu banyak percobaan salah. Silakan minta kode baru.", true);
  }
  const code = codeRaw.replace(/\D/g, "");
  if (!/^\d{6}$/.test(code) || !safeEqualHex(codeHash(id, code), c.otp_hash)) {
    await q(`UPDATE login_otps SET attempts = attempts + 1 WHERE id_hash = $1`, [c.id_hash]);
    const left = MAX_ATTEMPTS - c.attempts - 1;
    throw new OtpError(401, left > 0 ? `Kode salah. Sisa ${left} percobaan.` : "Kode salah. Batas percobaan habis.", left <= 0);
  }
  // pastikan baris benar-benar terhapus oleh request ini (cegah pemakaian ganda)
  const del = await q<{ id_hash: string }>(`DELETE FROM login_otps WHERE id_hash = $1 RETURNING id_hash`, [c.id_hash]);
  if (!del.length) throw new OtpError(400, RESTART, true);
  return c.user_id;
}

/** Kirim ulang kode untuk tantangan yang sama (kode lama tidak berlaku lagi). */
export async function resendOtp(id: string | undefined, ip: string | null): Promise<string> {
  const c = id ? await byId(id) : undefined;
  if (!id || !c) throw new OtpError(400, RESTART, true);
  if (c.sends >= MAX_SENDS) throw new OtpError(429, "Batas kirim ulang tercapai. Silakan minta kode baru.", true);
  const [u] = await q<{ name: string; email: string }>(`SELECT name, email FROM users WHERE id = $1`, [c.user_id]);
  if (!u) throw new OtpError(400, RESTART, true);
  await guard(u.email, ip);
  const code = newCode();
  await q(`UPDATE login_otps SET otp_hash = $2, expires_at = now() + ($3 || ' minutes')::interval, sent_at = now(), attempts = 0, sends = sends + 1 WHERE id_hash = $1`, [c.id_hash, codeHash(id, code), String(OTP_TTL_MIN)]);
  await mailCode(u.email, u.name, code);
  return u.email;
}

export const maskEmail = (e: string) => e.replace(/^(.{2})[^@]*(@.*)$/, (_, a, b) => `${a}***${b}`);
