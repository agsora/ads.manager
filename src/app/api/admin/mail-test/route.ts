import { NextResponse } from "next/server";
import { handle, requireSession } from "@/lib/auth";
import { testMail } from "@/lib/mailer";

/** Superadmin: kirim email uji ke alamat sendiri dan tampilkan jawaban server SMTP, supaya masalah pengiriman bisa dilacak tanpa membuka log. */
export const POST = handle(async () => {
  const s = await requireSession(["superadmin"]);
  return NextResponse.json({ to: s.email, ...(await testMail(s.email)) });
});
