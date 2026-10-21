import { NextResponse } from "next/server";
import { handle, HttpError, requireSession } from "@/lib/auth";
import { q } from "@/lib/db";
import { runDaily } from "@/lib/automation";

export const maxDuration = 60;

/** Vercel Cron (daily 01:00 UTC = 08:00 WIB). Authorised with CRON_SECRET. */
export const GET = handle(async (req: Request) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) throw new HttpError(401, "Unauthorized");
  const orgs = await q<{ id: number }>(`SELECT DISTINCT org_id AS id FROM users`);
  const results = [];
  for (const o of orgs) {
    try {
      results.push(await runDaily(o.id, { req }));
    } catch (e) {
      results.push({ orgId: o.id, error: (e as Error).message });
    }
  }
  return NextResponse.json({ ok: true, results });
});

/** Manual run for the current workspace from the Notifications page ("Jalankan sekarang"). */
export const POST = handle(async (req: Request) => {
  const s = await requireSession(["owner", "admin"]);
  const b = (await req.json().catch(() => ({}))) as { weekly?: boolean };
  const result = await runDaily(s.org, { force: true, weekly: !!b.weekly, req });
  return NextResponse.json(result);
});
