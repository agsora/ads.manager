import { NextResponse } from "next/server";
import { handle, HttpError, requireSession } from "@/lib/auth";
import { q } from "@/lib/db";
import { appUrl, emailEnabled, renderEmail, sendEmails } from "@/lib/email";

/** Sends a test email to the signed-in user so they can check delivery. */
export const POST = handle(async (req: Request) => {
  const s = await requireSession();
  if (!emailEnabled()) throw new HttpError(400, "Email belum aktif: RESEND_API_KEY belum di-set di server.");
  const [u] = await q<{ email: string }>(`SELECT email FROM users WHERE id = $1`, [s.uid]);
  const res = await sendEmails([
    {
      to: u.email,
      subject: "Tes notifikasi Ads Manager",
      html: renderEmail({
        eyebrow: "Tes email",
        title: "Notifikasi email sudah tersambung",
        intro: `Halo ${s.name}, email ini dikirim dari menu Notifikasi untuk memastikan pengiriman berjalan.`,
        cta: { label: "Buka Ads Manager", url: appUrl(req) },
      }),
    },
  ]);
  if (!res.sent) throw new HttpError(502, `Email gagal dikirim: ${res.error ?? "tidak diketahui"}`);
  return NextResponse.json({ ok: true, to: u.email });
});
