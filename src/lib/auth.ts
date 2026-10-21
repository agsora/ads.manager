import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, verifyToken, type Session } from "./token";
import { q } from "./db";

export { SESSION_COOKIE, createToken, verifyToken, type Session } from "./token";

export async function getSession(): Promise<Session | null> {
  const c = await cookies();
  return verifyToken(c.get(SESSION_COOKIE)?.value);
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/**
 * The token only proves who signed in. Role, name and workspace are re-read from the
 * database on every request, so deleted users, demotions and moves take effect at once.
 */
export async function requireSession(roles?: Session["role"][]): Promise<Session> {
  const token = await getSession();
  if (!token) throw new HttpError(401, "Silakan login terlebih dahulu");
  const [u] = await q<{ id: number; org_id: number; name: string; email: string; role: Session["role"]; org_name: string }>(
    `SELECT u.id, u.org_id, u.name, u.email, u.role, o.name AS org_name FROM users u JOIN organizations o ON o.id = u.org_id WHERE u.id = $1`,
    [token.uid],
  );
  if (!u) throw new HttpError(401, "Sesi tidak berlaku lagi, silakan login ulang");
  let org = u.org_id;
  let orgName = u.org_name;
  // only a superadmin may keep a workspace other than their own (opened from the admin page)
  if (u.role === "superadmin" && token.org !== u.org_id) {
    const [o] = await q<{ id: number; name: string }>(`SELECT id, name FROM organizations WHERE id = $1`, [token.org]);
    if (o) {
      org = o.id;
      orgName = o.name;
    }
  }
  const s: Session = { uid: u.id, org, orgName, name: u.name, email: u.email, role: u.role };
  // superadmin passes every role check
  if (roles && s.role !== "superadmin" && !roles.includes(s.role)) throw new HttpError(403, "Akses ditolak untuk role Anda");
  return s;
}

export function setSessionCookie(res: NextResponse, token: string) {
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

/** Wrap an API handler: converts thrown errors to JSON responses. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
      console.error(e);
      return NextResponse.json({ error: e instanceof Error ? e.message : "Server error" }, { status: 500 });
    }
  };
}
