import { NextResponse } from "next/server";
import { handle, requireSession } from "@/lib/auth";
import { q } from "@/lib/db";
import { emailEnabled } from "@/lib/email";
import { CATEGORIES } from "@/lib/notify";

export const GET = handle(async () => {
  const s = await requireSession();
  const [u] = await q<{ notify_prefs: Record<string, boolean>; email: string }>(`SELECT notify_prefs, email FROM users WHERE id = $1`, [s.uid]);
  const prefs = Object.fromEntries(
    Object.entries(CATEGORIES).map(([k, c]) => [k, u?.notify_prefs?.[`email_${k}`] ?? c.emailDefault]),
  );
  return NextResponse.json({ prefs, categories: CATEGORIES, emailEnabled: emailEnabled(), email: u?.email, sender: process.env.EMAIL_FROM || "Ads Manager <onboarding@resend.dev>" });
});

export const PUT = handle(async (req: Request) => {
  const s = await requireSession();
  const b = (await req.json()) as Record<string, boolean>;
  const patch = Object.fromEntries(Object.entries(b).filter(([k]) => k in CATEGORIES).map(([k, v]) => [`email_${k}`, !!v]));
  await q(`UPDATE users SET notify_prefs = notify_prefs || $2::jsonb WHERE id = $1`, [s.uid, JSON.stringify(patch)]);
  return NextResponse.json({ ok: true });
});
