import { NextResponse } from "next/server";
import { handle, HttpError } from "@/lib/auth";
import { OTP_COOKIE, OTP_TTL_MIN, OtpError, maskEmail, otpAvailable, startOtp } from "@/lib/otp";

const clientIp = (req: Request) => (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || null;

/** Langkah 1 login: kirim kode 6 digit ke email. Jawabannya sama untuk email terdaftar maupun tidak. */
export const POST = handle(async (req: Request) => {
  if (!otpAvailable()) throw new HttpError(503, "Login dengan kode email belum aktif. Gunakan password.");
  const { email } = (await req.json().catch(() => ({}))) as { email?: string };
  const e = String(email ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) throw new HttpError(400, "Masukkan alamat email yang valid.");
  try {
    const id = await startOtp(e, clientIp(req));
    const res = NextResponse.json({ ok: true, email: maskEmail(e), ttlMin: OTP_TTL_MIN });
    res.cookies.set(OTP_COOKIE, id, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: OTP_TTL_MIN * 60 });
    return res;
  } catch (err) {
    if (err instanceof OtpError) throw new HttpError(err.status, err.message);
    console.error("[otp] gagal kirim kode:", err);
    throw new HttpError(502, "Kode gagal dikirim ke email. Coba lagi sebentar.");
  }
});
