import { NextResponse } from "next/server";
import { q } from "./db";
import { createToken, setSessionCookie, type Session } from "./auth";

/** Buat sesi login (cookie) untuk user ini; dipakai oleh login OTP. */
export async function sessionResponseFor(userId: number): Promise<NextResponse | null> {
  const [u] = await q<{ id: number; org_id: number; name: string; email: string; role: Session["role"]; org_name: string }>(
    `SELECT u.id, u.org_id, u.name, u.email, u.role, o.name AS org_name FROM users u JOIN organizations o ON o.id = u.org_id WHERE u.id = $1`,
    [userId],
  );
  if (!u) return null;
  const token = await createToken({ uid: u.id, org: u.org_id, orgName: u.org_name, name: u.name, email: u.email, role: u.role });
  const res = NextResponse.json({ ok: true });
  setSessionCookie(res, token);
  return res;
}
