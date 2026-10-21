import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, verifyToken, type Session } from "./token";

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

export async function requireSession(roles?: Session["role"][]): Promise<Session> {
  const s = await getSession();
  if (!s) throw new HttpError(401, "Silakan login terlebih dahulu");
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
