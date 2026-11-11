import { createHash, randomBytes } from "node:crypto";
import { q } from "./db";
import { mailKind, sendMailOne } from "./mailer";

/**
 * Login dengan tautan yang dikirim ke email (tanpa mengetik kode). Tautan berisi token acak 256-bit,
 * berlaku 10 menit, sekali pakai; yang disimpan di database hanya hash-nya.
 */
export const LINK_TTL_MIN = 10;
const RESEND_COOLDOWN_S = 60;
const MAX_PER_EMAIL = 5; // per 15 menit
const MAX_PER_IP = 15;

export class OtpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const randomToken = () => randomBytes(32).toString("base64url");

/** Login tautan email bisa dipakai bila ada jalur pengiriman email. */
export const otpAvailable = () => mailKind() !== null;
/** OTP_ONLY=1: login password dimatikan, hanya tautan email. */
export const otpOnly = () => process.env.OTP_ONLY === "1";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

async function mailLink(to: string, name: string, url: string) {
  const html = `<!doctype html><html><body style="margin:0;background:#faf9f5;padding:24px 12px;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border:1px solid #e5e2d8;border-radius:12px">
<tr><td style="padding:22px 28px 0"><table cellpadding="0" cellspacing="0"><tr>
<td style="background:#c96442;color:#fff;font-family:Georgia,serif;font-style:italic;font-size:16px;width:26px;height:26px;text-align:center;border-radius:6px">a</td>
<td style="padding-left:9px;font-family:Georgia,serif;font-size:17px;color:#1f1e1d">Ads Manager</td></tr></table></td></tr>
<tr><td style="padding:22px 28px 26px">
<div style="font-family:Georgia,serif;font-size:22px;color:#1f1e1d">Tautan masuk Anda</div>
<p style="margin:12px 0 0;font-size:14px;line-height:1.6;color:#5e5d59">Halo ${esc(name)}, klik tombol di bawah untuk masuk ke Ads Manager. Tautan berlaku <b>${LINK_TTL_MIN} menit</b> dan hanya bisa dipakai sekali.</p>
<p style="margin:22px 0"><a href="${esc(url)}" style="display:inline-block;background:#1f1e1d;color:#faf9f5;text-decoration:none;font-size:14px;font-weight:600;padding:12px 22px;border-radius:8px">Masuk ke Ads Manager</a></p>
<p style="margin:0 0 6px;font-size:12px;color:#8a8880">Jika tombol tidak berfungsi, salin tautan ini ke browser:</p>
<p style="margin:0 0 14px;font-size:12px;color:#5e5d59;word-break:break-all">${esc(url)}</p>
<p style="margin:0;font-size:12.5px;line-height:1.6;color:#8a8880">Jangan teruskan email ini kepada siapa pun. Jika Anda tidak meminta tautan ini, abaikan email ini. Email ini dikirim otomatis, mohon tidak membalas.</p>
</td></tr></table></td></tr></table></body></html>`;
  await sendMailOne({
    to,
    subject: "Tautan masuk Ads Manager",
    html,
    text: `Halo ${name},\nKlik tautan berikut untuk masuk ke Ads Manager (berlaku ${LINK_TTL_MIN} menit, sekali pakai):\n${url}\nJangan teruskan email ini kepada siapa pun.`,
  });
}

/** Cegah email/IP dibanjiri tautan dan beri jeda antar-permintaan. Setiap permintaan dicatat (termasuk email yang tidak terdaftar, supaya tidak bisa dibedakan). */
async function guard(email: string, ip: string | null) {
  const [a] = await q<{ n: number; wait: number }>(
    `SELECT count(*)::int AS n,
            COALESCE(GREATEST(0, ceil(extract(epoch FROM (max(at) + ($2 || ' seconds')::interval - now())))), 0)::int AS wait
       FROM otp_sends WHERE email = $1 AND at > now() - interval '15 minutes'`,
    [email, String(RESEND_COOLDOWN_S)],
  );
  if (a.wait > 0) throw new OtpError(429, `Tunggu ${a.wait} detik sebelum meminta tautan lagi.`);
  const [b] = ip ? await q<{ n: number }>(`SELECT count(*)::int AS n FROM otp_sends WHERE ip = $1 AND at > now() - interval '15 minutes'`, [ip]) : [{ n: 0 }];
  if (a.n >= MAX_PER_EMAIL || b.n >= MAX_PER_IP) throw new OtpError(429, "Terlalu banyak permintaan. Coba lagi dalam 15 menit.");
  await q(`INSERT INTO otp_sends (email, ip) VALUES ($1, $2)`, [email, ip]);
  await q(`DELETE FROM otp_sends WHERE at < now() - interval '1 day'`);
}

/**
 * Kirim tautan masuk. Untuk email yang tidak terdaftar tidak ada email dikirim tetapi jawabannya sama,
 * jadi pihak luar tidak bisa mengecek siapa saja yang punya akun.
 */
export async function startLink(emailRaw: string, ip: string | null, baseUrl: string): Promise<void> {
  const email = emailRaw.trim().toLowerCase();
  await guard(email, ip);
  const [u] = await q<{ id: number; name: string; email: string }>(`SELECT id, name, email FROM users WHERE email = $1`, [email]);
  if (!u) return;
  const token = randomToken();
  await q(`DELETE FROM login_otps WHERE user_id = $1`, [u.id]);
  await q(`INSERT INTO login_otps (id_hash, user_id, otp_hash, expires_at) VALUES ($1, $2, 'link', now() + ($3 || ' minutes')::interval)`, [sha256(token), u.id, String(LINK_TTL_MIN)]);
  await mailLink(u.email, u.name, `${baseUrl.replace(/\/$/, "")}/login/konfirmasi?token=${encodeURIComponent(token)}`);
}

/** Tukar token dengan userId; token langsung dihapus (sekali pakai, aman dari pemakaian ganda bersamaan). */
export async function consumeLink(token: string | undefined): Promise<number> {
  if (!token || token.length < 20 || token.length > 200) throw new OtpError(400, "Tautan tidak valid. Minta tautan baru.");
  const rows = await q<{ user_id: number }>(`DELETE FROM login_otps WHERE id_hash = $1 AND expires_at > now() RETURNING user_id`, [sha256(token)]);
  if (!rows.length) throw new OtpError(400, "Tautan sudah dipakai atau kedaluwarsa. Minta tautan baru.");
  return rows[0].user_id;
}

export const maskEmail = (e: string) => e.replace(/^(.{2})[^@]*(@.*)$/, (_, a, b) => `${a}***${b}`);
