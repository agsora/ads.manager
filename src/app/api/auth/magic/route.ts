import { handle, HttpError } from "@/lib/auth";
import { sessionResponseFor } from "@/lib/login";
import { OtpError, consumeLink } from "@/lib/otp";

/** Tukar token dari tautan email dengan sesi login. Dipanggil dari tombol "Masuk" (POST), bukan saat tautan dibuka, supaya pemindai email tidak menghabiskan tokennya. */
export const POST = handle(async (req: Request) => {
  const { token } = (await req.json().catch(() => ({}))) as { token?: string };
  try {
    const userId = await consumeLink(token);
    const res = await sessionResponseFor(userId);
    if (!res) throw new HttpError(401, "Akun tidak ditemukan.");
    return res;
  } catch (err) {
    if (err instanceof OtpError) throw new HttpError(err.status, err.message);
    throw err;
  }
});
