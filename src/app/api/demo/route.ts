import { NextResponse } from "next/server";
import { handle, HttpError, requireSession } from "@/lib/auth";
import { seedDemo } from "@/lib/demo";
import { logActivity, q } from "@/lib/db";
import { RESOURCES } from "@/lib/resources";

export const maxDuration = 60;

/** Fill the workspace with sample data so every chart & insight can be explored. */
export const POST = handle(async () => {
  const s = await requireSession(["owner", "admin"]);
  const counts = await seedDemo(s.org);
  for (const b of ["Kembar Cafe", "Kembar Venue"]) await q(`INSERT INTO brands (org_id, name) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [s.org, b]);
  await logActivity(s.org, s.name, "Isi data contoh", JSON.stringify(counts));
  return NextResponse.json({ ok: true, counts });
});

/** Delete ALL module data of this workspace (brands, users & settings are kept). */
export const DELETE = handle(async (req: Request) => {
  const s = await requireSession(["owner"]);
  const only = new URL(req.url).searchParams.get("resource");
  const targets = only ? RESOURCES.filter((r) => r.key === only) : RESOURCES;
  if (!targets.length) throw new HttpError(404, "Modul tidak ditemukan");
  for (const r of targets) await q(`DELETE FROM ${r.table} WHERE org_id = $1`, [s.org]);
  await logActivity(s.org, s.name, "Hapus semua data", only ?? "semua modul");
  return NextResponse.json({ ok: true });
});
