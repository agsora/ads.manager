import { NextResponse } from "next/server";
import { handle, HttpError, requireSession } from "@/lib/auth";
import { getResource } from "@/lib/resources";
import { cleanInput, deleteRows, updateRow, validate } from "@/lib/repo";
import { logActivity } from "@/lib/db";

type Ctx = { params: Promise<{ resource: string; id: string }> };

export const PUT = handle(async (req: Request, ctx: Ctx) => {
  const s = await requireSession();
  const p = await ctx.params;
  const r = getResource(p.resource);
  if (!r) throw new HttpError(404, "Modul tidak ditemukan");
  const body = await req.json();
  const data = cleanInput(r, body);
  // validate required only for fields being sent
  const err = validate({ ...r, fields: r.fields.filter((f) => f.key in body) }, data);
  if (err) throw new HttpError(400, err);
  const row = await updateRow(s.org, r, Number(p.id), data);
  if (!row) throw new HttpError(404, "Data tidak ditemukan");
  await logActivity(s.org, s.name, `Ubah ${r.singular}`, String(row[r.titleField] ?? ""));
  return NextResponse.json({ row });
});

export const DELETE = handle(async (_req: Request, ctx: Ctx) => {
  const s = await requireSession();
  const p = await ctx.params;
  const r = getResource(p.resource);
  if (!r) throw new HttpError(404, "Modul tidak ditemukan");
  const n = await deleteRows(s.org, r, [Number(p.id)]);
  await logActivity(s.org, s.name, `Hapus ${r.singular}`, `id ${p.id}`);
  return NextResponse.json({ deleted: n });
});
