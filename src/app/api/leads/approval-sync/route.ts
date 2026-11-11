import { NextResponse } from "next/server";
import { handle, requireSession } from "@/lib/auth";
import { getSetting, setSetting, logActivity } from "@/lib/db";

const key = (org: number) => `lead_approval_sync:${org}`;
export const GET = handle(async () => {
  const s = await requireSession();
  return NextResponse.json(JSON.parse((await getSetting(key(s.org))) || "{}"));
});
export const POST = handle(async () => {
  const s = await requireSession();
  const status = JSON.parse((await getSetting(key(s.org))) || "{}");
  const waiting = status.requestedAt && (!status.finishedAt || status.requestedAt > status.finishedAt);
  if (!waiting) {
    status.requestedAt = new Date().toISOString();
    await setSetting(key(s.org), JSON.stringify(status));
    await logActivity(s.org, s.name, "Minta cek status Datun", "WA Leads · pemohon/pasangan/penjamin · telepon → NIK/KK sumber · hari ke-0 sampai ke-30");
  }
  return NextResponse.json(status);
});
