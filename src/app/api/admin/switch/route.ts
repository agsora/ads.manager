import { NextResponse } from "next/server";
import { createToken, handle, HttpError, requireSession, setSessionCookie } from "@/lib/auth";
import { logActivity, q } from "@/lib/db";

/** Superadmin opens another workspace: the session's org changes, the identity stays. */
export const POST = handle(async (req: Request) => {
  const s = await requireSession(["superadmin"]);
  const { orgId } = (await req.json()) as { orgId: number };
  const [org] = await q<{ id: number; name: string }>(`SELECT id, name FROM organizations WHERE id=$1`, [orgId]);
  if (!org) throw new HttpError(404, "Workspace tidak ditemukan");
  const token = await createToken({ ...s, org: org.id, orgName: org.name });
  await logActivity(org.id, s.name, "Superadmin membuka workspace");
  const res = NextResponse.json({ ok: true });
  setSessionCookie(res, token);
  return res;
});
