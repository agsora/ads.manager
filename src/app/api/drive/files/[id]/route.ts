import { NextResponse } from "next/server";
import { handle, HttpError, requireSession } from "@/lib/auth";
import { logActivity, q } from "@/lib/db";
import { trashInDrive } from "@/lib/drive";

type Ctx = { params: Promise<{ id: string }> };

/** Removes the file from the app and moves it to the Drive trash. */
export const DELETE = handle(async (_req: Request, ctx: Ctx) => {
  const s = await requireSession();
  const { id } = await ctx.params;
  const [f] = await q<{ drive_id: string; name: string }>(`DELETE FROM drive_files WHERE org_id = $1 AND id = $2 RETURNING drive_id, name`, [s.org, Number(id)]);
  if (!f) throw new HttpError(404, "File tidak ditemukan");
  await trashInDrive(f.drive_id).catch(() => {
    /* already gone from Drive: the record is removed anyway */
  });
  await logActivity(s.org, s.name, "Hapus file Drive", f.name);
  return NextResponse.json({ ok: true });
});
