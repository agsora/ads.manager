import { NextResponse } from "next/server";
import { handle, HttpError, requireSession } from "@/lib/auth";
import { q } from "@/lib/db";
import { driveEnabled, MAX_UPLOAD, signGrant } from "@/lib/drive";
import { resolveTarget } from "@/lib/drive-records";

/** Step 1 of a direct upload: authorise it and tell the browser which folder / file name to use. */
export const POST = handle(async (req: Request) => {
  const s = await requireSession();
  if (!driveEnabled()) throw new HttpError(400, "Google Drive belum terhubung. Buka menu File & Drive untuk panduan.");
  const b = (await req.json()) as { resource: string; recordId: number; filename: string; size: number };
  if (!b.filename || !b.recordId) throw new HttpError(400, "File atau data tidak lengkap");
  if (b.size > MAX_UPLOAD) throw new HttpError(400, "Ukuran file maksimal 25 MB");
  const t = await resolveTarget(s.org, b.resource, Number(b.recordId)).catch((e) => {
    throw new HttpError(404, (e as Error).message);
  });
  let name = t.fileName(b.filename);
  // several files for the same record: "name (2).ext", "name (3).ext"…
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  const [{ count }] = await q<{ count: number }>(`SELECT count(*)::int AS count FROM drive_files WHERE org_id = $1 AND folder_path = $2 AND name LIKE $3`, [s.org, t.path, `${base.replace(/[%_]/g, "")}%`]);
  if (count > 0) name = `${base} (${count + 1})${ext}`;
  return NextResponse.json({ ...signGrant(t.path, name), path: t.path, name });
});
