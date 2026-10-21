import { NextResponse } from "next/server";
import { handle, HttpError, requireSession } from "@/lib/auth";
import { q } from "@/lib/db";
import { driveEnabled, rootFolderUrl } from "@/lib/drive";
import { resolveTarget } from "@/lib/drive-records";

/** Files of one record's folder (all rows of the same campaign share a folder). */
export const GET = handle(async (req: Request) => {
  const s = await requireSession();
  const u = new URL(req.url);
  const resource = u.searchParams.get("resource") ?? "";
  const id = Number(u.searchParams.get("id"));
  const t = await resolveTarget(s.org, resource, id).catch((e) => {
    throw new HttpError(404, (e as Error).message);
  });
  const files = await q(
    `SELECT id, name, url, mime, size, uploaded_by, created_at FROM drive_files WHERE org_id = $1 AND folder_path = $2 ORDER BY created_at DESC`,
    [s.org, t.path],
  );
  return NextResponse.json({ enabled: driveEnabled(), path: t.path, label: t.label, files, rootUrl: rootFolderUrl() });
});
