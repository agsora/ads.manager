import { NextResponse } from "next/server";
import { handle, HttpError, requireSession } from "@/lib/auth";
import { getResource } from "@/lib/resources";
import { cleanInput } from "@/lib/repo";
import { logActivity, q } from "@/lib/db";

type Ctx = { params: Promise<{ resource: string }> };

/** Set the same field values on many rows at once (e.g. mark 200 contacts as "Terkirim"). */
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const s = await requireSession();
  const r = getResource((await ctx.params).resource);
  if (!r) throw new HttpError(404, "Modul tidak ditemukan");
  const { ids, data } = (await req.json()) as { ids: number[]; data: Record<string, unknown> };
  const clean = cleanInput(r, data ?? {});
  const keys = Object.keys(clean);
  if (!keys.length || !ids?.length) throw new HttpError(400, "Tidak ada perubahan");
  const res = await q(
    `UPDATE ${r.table} SET ${keys.map((k, i) => `${k} = $${i + 3}`).join(", ")}, updated_at = now() WHERE org_id = $1 AND id = ANY($2::int[]) RETURNING id`,
    [s.org, ids.map(Number), ...keys.map((k) => clean[k])],
  );
  await logActivity(s.org, s.name, `Ubah ${res.length} ${r.singular}`, keys.join(", "));
  return NextResponse.json({ updated: res.length });
});
