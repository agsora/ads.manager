import { NextResponse } from "next/server";
import { handle, HttpError, requireSession } from "@/lib/auth";
import { getSetting, logActivity, q, setSetting } from "@/lib/db";

/** Platform overview for the superadmin: every workspace, every user, sign-up setting. */
export const GET = handle(async () => {
  await requireSession(["superadmin"]);
  const orgs = await q(
    `SELECT o.id, o.name, o.created_at,
      (SELECT count(*)::int FROM users u WHERE u.org_id = o.id) AS users,
      (SELECT count(*)::int FROM ad_campaigns x WHERE x.org_id = o.id) AS ads,
      (SELECT count(*)::int FROM leads x WHERE x.org_id = o.id) AS leads,
      (SELECT count(*)::int FROM content_plans x WHERE x.org_id = o.id) AS content,
      (SELECT count(*)::int FROM blast_contacts x WHERE x.org_id = o.id) AS contacts,
      (SELECT count(*)::int FROM reviews x WHERE x.org_id = o.id) AS reviews
     FROM organizations o ORDER BY o.id`,
  );
  const users = await q(
    `SELECT u.id, u.name, u.email, u.role, u.created_at, u.org_id, o.name AS org_name
     FROM users u JOIN organizations o ON o.id = u.org_id ORDER BY u.id`,
  );
  return NextResponse.json({ orgs, users, allowSignup: (await getSetting("allow_signup")) === "true" });
});

export const PUT = handle(async (req: Request) => {
  const s = await requireSession(["superadmin"]);
  const b = (await req.json()) as { allowSignup?: boolean };
  if (typeof b.allowSignup !== "boolean") throw new HttpError(400, "Tidak ada perubahan");
  await setSetting("allow_signup", b.allowSignup ? "true" : "false");
  await logActivity(s.org, s.name, b.allowSignup ? "Buka pendaftaran publik" : "Tutup pendaftaran publik");
  return NextResponse.json({ ok: true });
});
