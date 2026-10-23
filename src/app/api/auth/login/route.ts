import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { q } from "@/lib/db";
import { createToken, handle, HttpError, setSessionCookie, type Session } from "@/lib/auth";

export const POST = handle(async (req: Request) => {
  const { email, password } = (await req.json()) as { email?: string; password?: string };
  if (!email || !password) throw new HttpError(400, "Email dan password wajib diisi");
  const key = email.trim().toLowerCase();
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || null;
  // brute-force guard: too many recent failures for this email (or from this address) pause logins for a while
  const [recent] = await q<{ n: number }>(`SELECT count(*)::int AS n FROM login_failures WHERE at > now() - interval '15 minutes' AND (email = $1 OR ($2::text IS NOT NULL AND ip = $2))`, [key, ip]);
  if (recent.n >= 10) throw new HttpError(429, "Terlalu banyak percobaan masuk. Coba lagi dalam 15 menit.");
  const rows = await q<{ id: number; org_id: number; name: string; email: string; role: Session["role"]; password_hash: string; org_name: string }>(
    `SELECT u.*, o.name AS org_name FROM users u JOIN organizations o ON o.id = u.org_id WHERE u.email = $1`,
    [email.trim().toLowerCase()],
  );
  const u = rows[0];
  if (!u || !(await bcrypt.compare(password, u.password_hash))) {
    await q(`INSERT INTO login_failures (email, ip) VALUES ($1, $2)`, [key, ip]);
    await q(`DELETE FROM login_failures WHERE at < now() - interval '1 day'`);
    throw new HttpError(401, "Email atau password salah");
  }
  await q(`DELETE FROM login_failures WHERE email = $1`, [key]);
  const token = await createToken({ uid: u.id, org: u.org_id, orgName: u.org_name, name: u.name, email: u.email, role: u.role });
  const res = NextResponse.json({ ok: true });
  setSessionCookie(res, token);
  return res;
});
