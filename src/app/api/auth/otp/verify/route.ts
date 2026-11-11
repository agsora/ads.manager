import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { handle, HttpError } from "@/lib/auth";
import { sessionResponseFor } from "@/lib/login";
import { OTP_COOKIE, OtpError, verifyOtp } from "@/lib/otp";

/** Langkah 2 login: cocokkan kode, lalu buat sesi. */
export const POST = handle(async (req: Request) => {
  const { code } = (await req.json().catch(() => ({}))) as { code?: string };
  const id = (await cookies()).get(OTP_COOKIE)?.value;
  try {
    const userId = await verifyOtp(id, String(code ?? ""));
    const res = await sessionResponseFor(userId);
    if (!res) throw new HttpError(401, "Akun tidak ditemukan.");
    res.cookies.delete(OTP_COOKIE);
    return res;
  } catch (err) {
    if (err instanceof OtpError) {
      const res = NextResponse.json({ error: err.message, restart: err.restart }, { status: err.status });
      if (err.restart) res.cookies.delete(OTP_COOKIE);
      return res;
    }
    throw err;
  }
});
