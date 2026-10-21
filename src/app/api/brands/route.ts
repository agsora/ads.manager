import { NextResponse } from "next/server";
import { handle, HttpError, requireSession } from "@/lib/auth";
import { getBrands } from "@/lib/repo";
import { logActivity, q } from "@/lib/db";

export const GET = handle(async () => {
  const s = await requireSession();
  return NextResponse.json({ brands: await getBrands(s.org) });
});

export const POST = handle(async (req: Request) => {
  const s = await requireSession(["owner", "admin"]);
  const b = (await req.json()) as { name?: string; industry?: string; color?: string; notes?: string };
  if (!b.name?.trim()) throw new HttpError(400, "Nama brand wajib diisi");
  await q(`INSERT INTO brands (org_id, name, industry, color, notes) VALUES ($1,$2,$3,$4,$5)`, [s.org, b.name.trim(), b.industry ?? null, b.color ?? null, b.notes ?? null]).catch(() => {
    throw new HttpError(409, "Brand dengan nama ini sudah ada");
  });
  await logActivity(s.org, s.name, "Tambah brand", b.name);
  return NextResponse.json({ ok: true });
});

export const PUT = handle(async (req: Request) => {
  const s = await requireSession(["owner", "admin"]);
  const b = (await req.json()) as { id: number; name: string; industry?: string; color?: string; notes?: string };
  const [old] = await q<{ name: string }>(`SELECT name FROM brands WHERE org_id=$1 AND id=$2`, [s.org, b.id]);
  if (!old) throw new HttpError(404, "Brand tidak ditemukan");
  await q(`UPDATE brands SET name=$3, industry=$4, color=$5, notes=$6 WHERE org_id=$1 AND id=$2`, [s.org, b.id, b.name.trim(), b.industry ?? null, b.color ?? null, b.notes ?? null]);
  if (old.name !== b.name.trim()) {
    // rename brand everywhere
    const { RESOURCES } = await import("@/lib/resources");
    for (const r of RESOURCES)
      if (r.fields.some((f) => f.key === "brand")) await q(`UPDATE ${r.table} SET brand=$3 WHERE org_id=$1 AND brand=$2`, [s.org, old.name, b.name.trim()]);
  }
  await logActivity(s.org, s.name, "Ubah brand", b.name);
  return NextResponse.json({ ok: true });
});

export const DELETE = handle(async (req: Request) => {
  const s = await requireSession(["owner", "admin"]);
  const id = Number(new URL(req.url).searchParams.get("id"));
  await q(`DELETE FROM brands WHERE org_id=$1 AND id=$2`, [s.org, id]);
  await logActivity(s.org, s.name, "Hapus brand", `id ${id}`);
  return NextResponse.json({ ok: true });
});
