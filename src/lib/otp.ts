import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { q } from "./db";
import { mailKind, sendMailOne } from "./mailer";

/** Login dengan kode OTP yang dikirim ke email (mirip dashboard internal). Kode 6 digit, berlaku 10 menit, sekali pakai. */
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

/** OTP bisa dipakai bila ada jalur pengiriman email. */
export const otpAvailable = () => mailKind() !== null;
/** OTP_ONLY=1: login password dimatikan, hanya OTP. */
export const otpOnly = () => process.env.OTP_ONLY === "1";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

async function mailCode(to: string, name: string, code: string) {
  const html = `<!doctype html><html><body style="margin:0;background:#faf9f5;padding:24px 12px;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border:1px solid #e5e2d8;border-radius:12px">
<tr><td style="padding:22px 28px 0"><table cellpadding="0" cellspacing="0"><tr>
<td style="background:#c96442;color:#fff;font-family:Georgia,serif;font-style:italic;font-size:16px;width:26px;height:26px;text-align:center;border-radius:6px">a</td>
<td style="padding-left:9px;font-family:Georgia,serif;font-size:17px;color:#1f1e1d">Ads Manager</td></tr></table></td></tr>
<tr><td style="padding:22px 28px 26px">
<div style="font-family:Georgia,serif;font-size:22px;color:#1f1e1d">Kode masuk Anda</div>
<p style="margin:12px 0 0;font-size:14px;line-height:1.6;color:#5e5d59">Halo ${esc(name)}, gunakan kode berikut untuk masuk. Kode berlaku <b>${OTP_TTL_MIN} menit</b> dan hanya bisa dipakai sekali.</p>
<div style="margin:20px 0;padding:16px;background:#faf9f5;border:1px solid #e5e2d8;border-radius:8px;text-align:center;font-family:'Courier New',monospace;font-size:32px;letter-spacing:10px;font-weight:bold;color:#1f1e1d">${code}</div>
<p style="margin:0;font-size:12.5px;line-height:1.6;color:#8a8880">Jangan berikan kode ini kepada siapa pun. Jika Anda tidak meminta kode ini, abaikan email ini.</p>
</td></tr></table></td></tr></table></body></html>`;
  await sendMailOne({
    to,
    subject: `${code} adalah kode masuk Ads Manager`,
    html,
    text: `Halo ${name},\nKode masuk Ads Manager: ${code}\nBerlaku ${OTP_TTL_MIN} menit. Jangan berikan kode ini kepada siapa pun.`,
  });
}

/** Cegah email/IP dibanjiri kode. Setiap permintaan dicatat (termasuk email yang tidak terdaftar, supaya tidak bisa dibedakan). */
async function guard(email: string, ip: string | null) {
  const [a] = await q<{ n: number }>(`SELECT count(*)::int AS n FROM otp_sends WHERE email = $1 AND at > now() - interval '15 minutes'`, [email]);
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
  wait: number;
}
const byId = async (id: string) =>
  (
    await q<Challenge>(
      `SELECT id_hash, user_id, otp_hash, expires_at < now() AS expired, attempts, sends,
              GREATEST(0, ceil(extract(epoch FROM (sent_at + ($2 || ' seconds')::interval - now()))))::int AS wait
         FROM login_otps WHERE id_hash = $1`,
      [sha256(id), String(RESEND_COOLDOWN_S)],
    )
  )[0];

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

export async function resendOtp(id: string | undefined, ip: string | null): Promise<string> {
  const c = id ? await byId(id) : undefined;
  if (!id || !c) throw new OtpError(400, RESTART, true);
  if (c.wait > 0) throw new OtpError(429, `Tunggu ${c.wait} detik sebelum mengirim ulang.`);
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
