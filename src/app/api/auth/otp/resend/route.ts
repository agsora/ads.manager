import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { handle, HttpError } from "@/lib/auth";
import { OTP_COOKIE, OtpError, maskEmail, resendOtp } from "@/lib/otp";

export const POST = handle(async (req: Request) => {
  const id = (await cookies()).get(OTP_COOKIE)?.value;
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || null;
  try {
    const email = await resendOtp(id, ip);
    return NextResponse.json({ ok: true, message: `Kode baru dikirim ke ${maskEmail(email)}.` });
  } catch (err) {
    if (err instanceof OtpError) {
      const res = NextResponse.json({ error: err.message, restart: err.restart }, { status: err.status });
      if (err.restart) res.cookies.delete(OTP_COOKIE);
      return res;
    }
    console.error("[otp] gagal kirim ulang:", err);
    throw new HttpError(502, "Kode gagal dikirim ke email. Coba lagi sebentar.");
  }
});
