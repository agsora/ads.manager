import { NextResponse } from "next/server";
import { handle, requireSession } from "@/lib/auth";
import { authUrl, signState } from "@/lib/drive";
import { appUrl } from "@/lib/email";

/** Sends the signed-in owner/admin to Google's consent screen. */
export const GET = handle(async (req: Request) => {
  const s = await requireSession(["owner", "admin"]);
  const redirect = `${appUrl(req)}/api/drive/oauth/callback`;
  return NextResponse.redirect(authUrl(redirect, signState({ uid: s.uid, org: s.org })));
});
