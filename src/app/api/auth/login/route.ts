import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { q } from "@/lib/db";
import { createToken, handle, HttpError, setSessionCookie, type Session } from "@/lib/auth";

export const POST = handle(async (req: Request) => {
  const { email, password } = (await req.json()) as { email?: string; password?: string };
  if (!email || !password) throw new HttpError(400, "Email dan password wajib diisi");
  const rows = await q<{ id: number; org_id: number; name: string; email: string; role: Session["role"]; password_hash: string; org_name: string }>(
    `SELECT u.*, o.name AS org_name FROM users u JOIN organizations o ON o.id = u.org_id WHERE u.email = $1`,
    [email.trim().toLowerCase()],
  );
  const u = rows[0];
  if (!u || !(await bcrypt.compare(password, u.password_hash))) throw new HttpError(401, "Email atau password salah");
  const token = await createToken({ uid: u.id, org: u.org_id, orgName: u.org_name, name: u.name, email: u.email, role: u.role });
  const res = NextResponse.json({ ok: true });
  setSessionCookie(res, token);
  return res;
});
