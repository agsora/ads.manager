import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { q } from "@/lib/db";
import { createToken, handle, HttpError, setSessionCookie } from "@/lib/auth";
import { DEFAULT_BRANDS } from "@/lib/resources";

const Body = z.object({
  orgName: z.string().trim().min(2, "Nama bisnis minimal 2 karakter"),
  name: z.string().trim().min(2, "Nama minimal 2 karakter"),
  email: z.string().trim().toLowerCase().email("Email tidak valid"),
  password: z.string().min(8, "Password minimal 8 karakter"),
});

export const POST = handle(async (req: Request) => {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0].message);
  const { orgName, name, email, password } = parsed.data;
  const exists = await q(`SELECT 1 FROM users WHERE email = $1`, [email]);
  if (exists.length) throw new HttpError(409, "Email sudah terdaftar, silakan login");
  const [org] = await q<{ id: number }>(`INSERT INTO organizations (name) VALUES ($1) RETURNING id`, [orgName]);
  const hash = await bcrypt.hash(password, 10);
  const [user] = await q<{ id: number }>(
    `INSERT INTO users (org_id, email, name, password_hash, role) VALUES ($1,$2,$3,$4,'owner') RETURNING id`,
    [org.id, email, name, hash],
  );
  for (const b of DEFAULT_BRANDS) await q(`INSERT INTO brands (org_id, name) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [org.id, b]);
  const token = await createToken({ uid: user.id, org: org.id, orgName, name, email, role: "owner" });
  const res = NextResponse.json({ ok: true });
  setSessionCookie(res, token);
  return res;
});
