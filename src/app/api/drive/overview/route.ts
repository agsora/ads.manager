import { NextResponse } from "next/server";
import { handle, requireSession } from "@/lib/auth";
import { q } from "@/lib/db";
import { driveEnabled, rootFolderUrl } from "@/lib/drive";

export const GET = handle(async (req: Request) => {
  const s = await requireSession();
  const term = (new URL(req.url).searchParams.get("q") ?? "").trim();
  const like = `%${term.replace(/[%_]/g, "")}%`;
  const [folders, files, [tot]] = await Promise.all([
    q(`SELECT folder_path, count(*)::int AS files, COALESCE(sum(size),0)::bigint AS bytes, max(created_at) AS last_at, max(folder_url) AS folder_url
       FROM drive_files WHERE org_id = $1 GROUP BY folder_path ORDER BY max(created_at) DESC LIMIT 200`, [s.org]),
    q(`SELECT id, resource, folder_path, name, url, mime, size, uploaded_by, created_at FROM drive_files
       WHERE org_id = $1 ${term ? "AND (name ILIKE $2 OR folder_path ILIKE $2)" : ""} ORDER BY created_at DESC LIMIT 100`, term ? [s.org, like] : [s.org]),
    q<{ files: number; bytes: number }>(`SELECT count(*)::int AS files, COALESCE(sum(size),0)::bigint AS bytes FROM drive_files WHERE org_id = $1`, [s.org]),
  ]);
  return NextResponse.json({
    enabled: driveEnabled(),
    rootUrl: rootFolderUrl(),
    folders,
    files,
    totals: tot,
    appUrlHint: process.env.APP_URL ?? null,
  });
});
