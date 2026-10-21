import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { getSetting, q } from "@/lib/db";
import { createToken, handle, HttpError, setSessionCookie } from "@/lib/auth";
import { DEFAULT_BRANDS } from "@/lib/resources";

const Body = z.object({
  name: z.string().trim().min(2, "Nama minimal 2 karakter"),
  email: z.string().trim().toLowerCase().email("Email tidak valid"),
  password: z.string().min(8, "Password minimal 8 karakter"),
});

/**
 * The very first account becomes the superadmin. After that, self sign-up only works
 * when the superadmin has opened it (each sign-up gets its own workspace).
 */
export const POST = handle(async (req: Request) => {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0].message);
  const { name, email, password } = parsed.data;

  const [{ count }] = await q<{ count: number }>(`SELECT count(*)::int AS count FROM users`);
  const first = count === 0;
  if (!first && (await getSetting("allow_signup")) !== "true")
    throw new HttpError(403, "Pendaftaran ditutup. Minta admin untuk membuatkan akun Anda.");
  if ((await q(`SELECT 1 FROM users WHERE email = $1`, [email])).length) throw new HttpError(409, "Email sudah terdaftar, silakan masuk");

  const workspace = first ? "Workspace Utama" : `Workspace ${name}`;
  const [org] = await q<{ id: number }>(`INSERT INTO organizations (name) VALUES ($1) RETURNING id`, [workspace]);
  const role = first ? "superadmin" : "owner";
  const [user] = await q<{ id: number }>(
    `INSERT INTO users (org_id, email, name, password_hash, role) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [org.id, email, name, await bcrypt.hash(password, 10), role],
  );
  for (const b of DEFAULT_BRANDS) await q(`INSERT INTO brands (org_id, name) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [org.id, b]);
  const token = await createToken({ uid: user.id, org: org.id, orgName: workspace, name, email, role });
  const res = NextResponse.json({ ok: true, role });
  setSessionCookie(res, token);
  return res;
});
