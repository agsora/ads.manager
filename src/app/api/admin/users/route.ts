import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { handle, HttpError, requireSession } from "@/lib/auth";
import { logActivity, q } from "@/lib/db";
import { DEFAULT_BRANDS } from "@/lib/resources";

const ROLES = ["superadmin", "owner", "admin", "staff"];

/** Create a user in an existing workspace, or in a new one (orgId = 0). */
export const POST = handle(async (req: Request) => {
  const s = await requireSession(["superadmin"]);
  const b = (await req.json()) as { name?: string; email?: string; password?: string; role?: string; orgId?: number; workspace?: string };
  if (!b.name?.trim() || !b.email?.trim() || !b.password) throw new HttpError(400, "Nama, email & password wajib diisi");
  if (b.password.length < 8) throw new HttpError(400, "Password minimal 8 karakter");
  const role = ROLES.includes(b.role ?? "") ? b.role! : "staff";
  const email = b.email.trim().toLowerCase();
  if ((await q(`SELECT 1 FROM users WHERE email=$1`, [email])).length) throw new HttpError(409, "Email sudah dipakai");
  let orgId = Number(b.orgId) || 0;
  if (!orgId) {
    const [org] = await q<{ id: number }>(`INSERT INTO organizations (name) VALUES ($1) RETURNING id`, [b.workspace?.trim() || `Workspace ${b.name.trim()}`]);
    orgId = org.id;
    for (const br of DEFAULT_BRANDS) await q(`INSERT INTO brands (org_id, name) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [orgId, br]);
  }
  await q(`INSERT INTO users (org_id, email, name, password_hash, role) VALUES ($1,$2,$3,$4,$5)`, [orgId, email, b.name.trim(), await bcrypt.hash(b.password, 10), role]);
  await logActivity(s.org, s.name, "Superadmin: tambah user", `${email} (${role})`);
  return NextResponse.json({ ok: true });
});

export const PUT = handle(async (req: Request) => {
  const s = await requireSession(["superadmin"]);
  const b = (await req.json()) as { id: number; role?: string; password?: string; orgId?: number; name?: string };
  const [u] = await q<{ id: number; role: string }>(`SELECT id, role FROM users WHERE id=$1`, [b.id]);
  if (!u) throw new HttpError(404, "User tidak ditemukan");
  if (b.role) {
    if (!ROLES.includes(b.role)) throw new HttpError(400, "Role tidak dikenal");
    if (u.id === s.uid && b.role !== "superadmin") throw new HttpError(400, "Tidak bisa menurunkan role akun sendiri");
    await q(`UPDATE users SET role=$2 WHERE id=$1`, [b.id, b.role]);
  }
  if (b.password) {
    if (b.password.length < 8) throw new HttpError(400, "Password minimal 8 karakter");
    await q(`UPDATE users SET password_hash=$2 WHERE id=$1`, [b.id, await bcrypt.hash(b.password, 10)]);
  }
  if (b.orgId) await q(`UPDATE users SET org_id=$2 WHERE id=$1`, [b.id, b.orgId]);
  if (b.name?.trim()) await q(`UPDATE users SET name=$2 WHERE id=$1`, [b.id, b.name.trim()]);
  await logActivity(s.org, s.name, "Superadmin: ubah user", `id ${b.id}${b.password ? " (reset password)" : ""}`);
  return NextResponse.json({ ok: true });
});

export const DELETE = handle(async (req: Request) => {
  const s = await requireSession(["superadmin"]);
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (id === s.uid) throw new HttpError(400, "Tidak bisa menghapus akun sendiri");
  await q(`DELETE FROM users WHERE id=$1`, [id]);
  await logActivity(s.org, s.name, "Superadmin: hapus user", `id ${id}`);
  return NextResponse.json({ ok: true });
});
