import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "am_session";

export interface Session {
  uid: number;
  org: number;
  orgName: string;
  name: string;
  email: string;
  role: "superadmin" | "owner" | "admin" | "staff";
}

const secret = () => new TextEncoder().encode(process.env.AUTH_SECRET || "dev-insecure-secret-change-me");

export async function createToken(s: Session) {
  return new SignJWT({ ...s })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret());
}

export async function verifyToken(token?: string): Promise<Session | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload as unknown as Session;
  } catch {
    return null;
  }
}

