import { NextResponse } from "next/server";
import { handle, HttpError } from "@/lib/auth";
import { MailError } from "@/lib/mailer";
import { LINK_TTL_MIN, OtpError, maskEmail, otpAvailable, startLink } from "@/lib/otp";

const clientIp = (req: Request) => (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || null;

/** Alamat dasar untuk tautan di email: dari APP_URL; di produksi tidak memakai header Host (bisa dipalsukan). */
function baseUrl(req: Request) {
  if (process.env.APP_URL) return process.env.APP_URL;
  if (process.env.NODE_ENV === "production") return "https://ads-manager-beryl.vercel.app";
  return new URL(req.url).origin;
}

/** Kirim tautan masuk ke email. Jawabannya sama untuk email terdaftar maupun tidak. */
export const POST = handle(async (req: Request) => {
  if (!otpAvailable()) throw new HttpError(503, "Login dengan tautan email belum aktif. Gunakan password.");
  const { email } = (await req.json().catch(() => ({}))) as { email?: string };
  const e = String(email ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) throw new HttpError(400, "Masukkan alamat email yang valid.");
  try {
    await startLink(e, clientIp(req), baseUrl(req));
    return NextResponse.json({ ok: true, email: maskEmail(e), ttlMin: LINK_TTL_MIN });
  } catch (err) {
    if (err instanceof OtpError) throw new HttpError(err.status, err.message);
    if (err instanceof MailError) throw new HttpError(502, `Tautan gagal dikirim. ${err.message}`);
    console.error("[otp] gagal kirim tautan:", err);
    throw new HttpError(502, "Tautan gagal dikirim ke email. Coba lagi sebentar.");
  }
});
