import { NextResponse } from "next/server";
import { handle, HttpError, requireSession } from "@/lib/auth";
import { getResource } from "@/lib/resources";
import { deleteRows } from "@/lib/repo";
import { logActivity } from "@/lib/db";

type Ctx = { params: Promise<{ resource: string }> };

export const POST = handle(async (req: Request, ctx: Ctx) => {
  const s = await requireSession();
  const r = getResource((await ctx.params).resource);
  if (!r) throw new HttpError(404, "Modul tidak ditemukan");
  const { ids } = (await req.json()) as { ids: number[] };
  const n = await deleteRows(s.org, r, (ids ?? []).map(Number).filter(Boolean));
  await logActivity(s.org, s.name, `Hapus ${n} ${r.singular}`);
  return NextResponse.json({ deleted: n });
});
