import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { logActivity } from "@/lib/db";
import { exchangeCode, recordAccount, verifyState } from "@/lib/drive";
import { appUrl } from "@/lib/email";

/** Google redirects here with ?code. The refresh token is stored encrypted in the database. */
export async function GET(req: Request) {
  const base = appUrl(req);
  const back = (q: string) => NextResponse.redirect(`${base}/drive?${q}`);
  try {
    const s = await requireSession(["owner", "admin"]);
    const u = new URL(req.url);
    if (u.searchParams.get("error")) return back(`error=${encodeURIComponent(u.searchParams.get("error")!)}`);
    const st = verifyState<{ uid: number }>(u.searchParams.get("state") ?? "");
    if (!st || st.uid !== s.uid) return back("error=state_invalid");
    await exchangeCode(u.searchParams.get("code") ?? "", `${base}/api/drive/oauth/callback`);
    await recordAccount();
    await logActivity(s.org, s.name, "Hubungkan Google Drive");
    return back("connected=1");
  } catch (e) {
    return back(`error=${encodeURIComponent((e as Error).message.slice(0, 160))}`);
  }
}
