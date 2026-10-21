import { NextResponse } from "next/server";
import { handle, HttpError, requireSession } from "@/lib/auth";
import { logActivity, q } from "@/lib/db";

export const PUT = handle(async (req: Request) => {
  const s = await requireSession(["superadmin"]);
  const b = (await req.json()) as { id: number; name: string };
  if (!b.name?.trim()) throw new HttpError(400, "Nama workspace wajib diisi");
  await q(`UPDATE organizations SET name=$2 WHERE id=$1`, [b.id, b.name.trim()]);
  await logActivity(s.org, s.name, "Superadmin: ubah workspace", b.name);
  return NextResponse.json({ ok: true });
});

/** Deletes a workspace with ALL of its users and data. */
export const DELETE = handle(async (req: Request) => {
  const s = await requireSession(["superadmin"]);
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (id === s.org) throw new HttpError(400, "Tidak bisa menghapus workspace yang sedang dibuka");
  const [own] = await q(`SELECT 1 FROM users WHERE org_id=$1 AND id=$2`, [id, s.uid]);
  if (own) throw new HttpError(400, "Workspace ini berisi akun Anda sendiri");
  await q(`DELETE FROM organizations WHERE id=$1`, [id]);
  await logActivity(s.org, s.name, "Superadmin: hapus workspace", `id ${id}`);
  return NextResponse.json({ ok: true });
});
