import { NextResponse } from "next/server";
import { handle, HttpError, requireSession } from "@/lib/auth";
import { logActivity } from "@/lib/db";
import { saveFileRecord } from "@/lib/drive";
import { resolveTarget } from "@/lib/drive-records";
import { recordEvent } from "@/lib/events";
import { RESOURCE_MAP, type Row } from "@/lib/resources";
import { updateRow } from "@/lib/repo";

/** Step 2: remember an uploaded file, and move a content plan forward when its design arrives. */
export const POST = handle(async (req: Request) => {
  const s = await requireSession();
  const b = (await req.json()) as { resource: string; recordId: number; path: string; name: string; driveId: string; url: string; folderUrl?: string; mime?: string; size?: number };
  const t = await resolveTarget(s.org, b.resource, Number(b.recordId)).catch((e) => {
    throw new HttpError(404, (e as Error).message);
  });
  // the folder is always recomputed from the record: a client cannot file things elsewhere
  if (b.path !== t.path) throw new HttpError(400, "Folder tidak sesuai");
  if (!/^https:\/\/(drive|docs)\.google\.com\//.test(b.url ?? "")) throw new HttpError(400, "Link Drive tidak valid");
  const id = await saveFileRecord({
    orgId: s.org, resource: b.resource, recordId: Number(b.recordId), folderPath: t.path, name: b.name, driveId: b.driveId,
    url: b.url, folderUrl: b.folderUrl ?? null, mime: b.mime ?? "", size: Number(b.size ?? 0), by: s.name,
  });
  await logActivity(s.org, s.name, "Upload file ke Drive", `${t.path}/${b.name}`);

  // design finished → status "Desain Selesai" + waiting for review, and tell the team
  if (b.resource === "content" && ["Ide", "Draft", "Produksi", null, undefined, ""].includes(t.row.status as string | null)) {
    const old = t.row as Row;
    const row = await updateRow(s.org, RESOURCE_MAP.content, Number(b.recordId), { status: "Desain Selesai", approval_status: "Menunggu review" });
    if (row) recordEvent({ s, r: RESOURCE_MAP.content, action: "update", row, old, req });
  }
  return NextResponse.json({ ok: true, id });
});

