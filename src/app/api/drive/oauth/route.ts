import { NextResponse } from "next/server";
import { handle, requireSession } from "@/lib/auth";
import { logActivity } from "@/lib/db";
import { disconnect, driveStatus, rootFolderUrl } from "@/lib/drive";
import { appUrl } from "@/lib/email";

/** Connection status + the redirect URI to register in the Google OAuth client. */
export const GET = handle(async (req: Request) => {
  await requireSession();
  return NextResponse.json({ ...(await driveStatus()), rootUrl: rootFolderUrl(), redirectUri: `${appUrl(req)}/api/drive/oauth/callback` });
});

export const DELETE = handle(async () => {
  const s = await requireSession(["owner", "admin"]);
  await disconnect();
  await logActivity(s.org, s.name, "Putuskan Google Drive");
  return NextResponse.json({ ok: true });
});
