import { NextResponse } from "next/server";
import { handle } from "@/lib/auth";
import { getSetting, q } from "@/lib/db";

/** Public: tells the login/register pages whether first-run setup or sign-up is available. */
export const GET = handle(async () => {
  const [{ count }] = await q<{ count: number }>(`SELECT count(*)::int AS count FROM users WHERE role = 'superadmin'`);
  return NextResponse.json({ needsSetup: count === 0, allowSignup: (await getSetting("allow_signup")) === "true" });
});
