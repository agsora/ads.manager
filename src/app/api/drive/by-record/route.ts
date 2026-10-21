import { NextResponse } from "next/server";
import { handle, requireSession } from "@/lib/auth";
import { q } from "@/lib/db";
import { driveEnabled } from "@/lib/drive";

/** Files attached directly to the records of one module in a date range (calendar thumbnails). */
export const GET = handle(async (req: Request) => {
  const s = await requireSession();
  const u = new URL(req.url);
  const resource = u.searchParams.get("resource") ?? "content";
  const from = u.searchParams.get("from") ?? "1900-01-01";
  const to = u.searchParams.get("to") ?? "2999-01-01";
  if (resource !== "content") return NextResponse.json({ enabled: await driveEnabled(), files: [] });
  const files = await q(
    `SELECT f.id, f.record_id, f.name, f.drive_id, f.url, f.mime, f.created_at
       FROM drive_files f JOIN content_plans c ON c.id = f.record_id AND c.org_id = f.org_id
      WHERE f.org_id = $1 AND f.resource = 'content' AND c.post_date BETWEEN $2 AND $3
      ORDER BY f.created_at DESC LIMIT 600`,
    [s.org, from, to],
  );
  return NextResponse.json({ enabled: await driveEnabled(), files });
});
