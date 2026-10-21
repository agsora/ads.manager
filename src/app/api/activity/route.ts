import { NextResponse } from "next/server";
import { handle, requireSession } from "@/lib/auth";
import { q } from "@/lib/db";

export const GET = handle(async () => {
  const s = await requireSession();
  const rows = await q(`SELECT user_name, action, detail, created_at FROM activity_log WHERE org_id=$1 ORDER BY id DESC LIMIT 100`, [s.org]);
  return NextResponse.json({ rows });
});
