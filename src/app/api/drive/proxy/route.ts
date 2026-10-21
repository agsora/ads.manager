import { NextResponse } from "next/server";
import { handle, HttpError, requireSession } from "@/lib/auth";
import { driveEnabled, uploadFromServer } from "@/lib/drive";
import { resolveTarget } from "@/lib/drive-records";

export const maxDuration = 60;

/** Fallback for small files when the browser cannot reach Apps Script directly (limit: 4 MB by the serverless body size). */
export const POST = handle(async (req: Request) => {
  const s = await requireSession();
  if (!driveEnabled()) throw new HttpError(400, "Google Drive belum terhubung");
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "File belum dipilih");
  if (file.size > 4 * 1024 * 1024) throw new HttpError(400, "Lewat server maksimal 4 MB");
  const t = await resolveTarget(s.org, String(form.get("resource")), Number(form.get("recordId"))).catch((e) => {
    throw new HttpError(404, (e as Error).message);
  });
  const name = t.fileName(file.name);
  const up = await uploadFromServer(t.path, name, file.type || "application/octet-stream", Buffer.from(await file.arrayBuffer()));
  return NextResponse.json({ ...up, path: t.path, name, mime: file.type, size: file.size });
});
