import { NextResponse } from "next/server";
import { handle, HttpError, requireSession } from "@/lib/auth";
import { getResource } from "@/lib/resources";
import { applyDerive, cleanInput, insertRow, listRows, validate } from "@/lib/repo";
import { logActivity, q } from "@/lib/db";
import { recordEvent } from "@/lib/events";

type Ctx = { params: Promise<{ resource: string }> };

export const GET = handle(async (req: Request, ctx: Ctx) => {
  const s = await requireSession();
  const r = getResource((await ctx.params).resource);
  if (!r) throw new HttpError(404, "Modul tidak ditemukan");
  const u = new URL(req.url);
  const rows = await listRows(s.org, r, {
    from: u.searchParams.get("from"),
    to: u.searchParams.get("to"),
    brand: u.searchParams.get("brand"),
    search: u.searchParams.get("q"),
  });
  return NextResponse.json({ rows });
});

export const POST = handle(async (req: Request, ctx: Ctx) => {
  const s = await requireSession();
  const r = getResource((await ctx.params).resource);
  if (!r) throw new HttpError(404, "Modul tidak ditemukan");
  const data = applyDerive(r, cleanInput(r, await req.json()));
  if (r.key === "content") data.created_by = s.uid;
  const err = validate(r, data);
  if (err) throw new HttpError(400, err);
  if (typeof data.brand === "string" && data.brand)
    await q(`INSERT INTO brands (org_id, name) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [s.org, data.brand]);
  const row = await insertRow(s.org, r, data);
  await logActivity(s.org, s.name, `Tambah ${r.singular}`, String(data[r.titleField] ?? ""));
  recordEvent({ s, r, action: "create", row, req });
  return NextResponse.json({ row });
});
