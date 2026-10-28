import { NextResponse } from "next/server";
import { handle, requireSession } from "@/lib/auth";
import { logActivity } from "@/lib/db";
import { syncFollowers } from "@/lib/followers-sync";

export const maxDuration = 60;

/** POST → read today's followers of the connected Instagram accounts ("Update sekarang" on the Followers page). */
export const POST = handle(async () => {
  const s = await requireSession();
  const res = await syncFollowers(s.org);
  await logActivity(s.org, s.name, "Update followers dari Instagram", `${res.updated} akun, ${res.errors.length} gagal`);
  return NextResponse.json(res);
});
