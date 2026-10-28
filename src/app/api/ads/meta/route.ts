import { NextResponse } from "next/server";
import { handle, HttpError, requireSession } from "@/lib/auth";
import { logActivity } from "@/lib/db";
import { metaAccounts, metaLastSync, saveMetaAccounts, syncMetaAds, type MetaAdAccount } from "@/lib/meta-ads";

export const maxDuration = 60;

/** GET → connected ad accounts and when the figures were last read from Meta. */
export const GET = handle(async () => {
  const s = await requireSession();
  return NextResponse.json({ accounts: await metaAccounts(s.org), lastSync: await metaLastSync(s.org) });
});

/** PUT { accounts: [{ account, brand }] } → which Meta ad account belongs to which brand. */
export const PUT = handle(async (req: Request) => {
  const s = await requireSession(["owner", "admin", "superadmin"]);
  const b = (await req.json()) as { accounts?: MetaAdAccount[] };
  const accounts = await saveMetaAccounts(s.org, b.accounts ?? []);
  await logActivity(s.org, s.name, "Atur akun iklan Meta", `${accounts.length} akun`);
  return NextResponse.json({ accounts });
});

/** POST { days } → read the last N days from Meta Ads now. */
export const POST = handle(async (req: Request) => {
  const s = await requireSession(["owner", "admin", "superadmin", "staff"]);
  const b = (await req.json().catch(() => ({}))) as { days?: number };
  if (!(await metaAccounts(s.org)).length) throw new HttpError(400, "Atur akun iklan Meta terlebih dahulu");
  const days = Math.min(400, Math.max(1, Number(b.days) || 30));
  const res = await syncMetaAds(s.org, days);
  await logActivity(s.org, s.name, "Tarik data Meta Ads", `${res.inserted} baru, ${res.updated} diperbarui, ${res.errors.length} gagal`);
  return NextResponse.json(res);
});
