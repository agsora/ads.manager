import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { handle, HttpError, requireSession } from "@/lib/auth";
import { logActivity, q } from "@/lib/db";

export const GET = handle(async () => {
  const s = await requireSession();
  const users = await q(`SELECT id, name, email, role, created_at FROM users WHERE org_id=$1 ORDER BY id`, [s.org]);
  return NextResponse.json({ users });
});

export const POST = handle(async (req: Request) => {
  const s = await requireSession(["owner", "admin"]);
  const b = (await req.json()) as { name: string; email: string; password: string; role: string };
  if (!b.name || !b.email || !b.password) throw new HttpError(400, "Nama, email & password wajib diisi");
  if (b.password.length < 8) throw new HttpError(400, "Password minimal 8 karakter");
  const role = b.role === "admin" ? "admin" : "staff";
  const email = b.email.trim().toLowerCase();
  if ((await q(`SELECT 1 FROM users WHERE email=$1`, [email])).length) throw new HttpError(409, "Email sudah dipakai");
  await q(`INSERT INTO users (org_id, email, name, password_hash, role) VALUES ($1,$2,$3,$4,$5)`, [s.org, email, b.name.trim(), await bcrypt.hash(b.password, 10), role]);
  await logActivity(s.org, s.name, "Tambah user", email);
  return NextResponse.json({ ok: true });
});

export const PUT = handle(async (req: Request) => {
  const s = await requireSession();
  const b = (await req.json()) as { id?: number; password?: string; role?: string; name?: string };
  const id = b.id ?? s.uid;
  if (id !== s.uid && !["owner", "admin"].includes(s.role)) throw new HttpError(403, "Akses ditolak");
  if (b.password) {
    if (b.password.length < 8) throw new HttpError(400, "Password minimal 8 karakter");
    await q(`UPDATE users SET password_hash=$3 WHERE org_id=$1 AND id=$2`, [s.org, id, await bcrypt.hash(b.password, 10)]);
  }
  if (b.role && (s.role === "owner" || s.role === "superadmin") && id !== s.uid) await q(`UPDATE users SET role=$3 WHERE org_id=$1 AND id=$2 AND role <> 'superadmin'`, [s.org, id, b.role === "admin" ? "admin" : "staff"]);
  if (b.name) await q(`UPDATE users SET name=$3 WHERE org_id=$1 AND id=$2`, [s.org, id, b.name]);
  return NextResponse.json({ ok: true });
});

export const DELETE = handle(async (req: Request) => {
  const s = await requireSession(["owner", "admin"]);
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (id === s.uid) throw new HttpError(400, "Tidak bisa menghapus akun sendiri");
  await q(`DELETE FROM users WHERE org_id=$1 AND id=$2 AND role NOT IN ('owner', 'superadmin')`, [s.org, id]);
  await logActivity(s.org, s.name, "Hapus user", `id ${id}`);
  return NextResponse.json({ ok: true });
});
