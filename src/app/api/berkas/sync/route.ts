import { NextResponse } from "next/server";
import { handle, requireSession } from "@/lib/auth";
import { getSetting, logActivity, setSetting } from "@/lib/db";

/**
 * Sinkron Berkas In membaca database Konvensional/Syariah lewat tunnel SSH dari komputer kantor, jadi server ini tidak bisa
 * menjalankannya. Tombol "Sinkron" hanya menaruh permintaan di sini; komputer kantor memeriksanya tiap beberapa menit
 * (scripts/sync-berkas.ts --if-requested), menjalankan sinkron, lalu menulis hasilnya ke status yang sama.
 */
const key = (org: number) => `berkas_sync:${org}`;
type Status = { requestedAt?: string; startedAt?: string; finishedAt?: string; running?: boolean; ok?: boolean; total?: number; note?: string };

const read = async (org: number): Promise<Status> => {
  try {
    return JSON.parse((await getSetting(key(org))) ?? "{}") as Status;
  } catch {
    return {};
  }
};

export const GET = handle(async () => {
  const s = await requireSession();
  return NextResponse.json(await read(s.org));
});

export const POST = handle(async () => {
  const s = await requireSession(["owner", "admin", "superadmin", "staff"]);
  const st = await read(s.org);
  const waiting = st.requestedAt && (!st.finishedAt || st.finishedAt < st.requestedAt);
  // a request already waiting (or sent in the last minute) is not stacked again
  if (!(waiting && Date.now() - new Date(st.requestedAt!).getTime() < 24 * 3600_000)) {
    st.requestedAt = new Date().toISOString();
    await setSetting(key(s.org), JSON.stringify(st));
    await logActivity(s.org, s.name, "Minta sinkron Berkas In", "dari tombol Sinkron");
  }
  return NextResponse.json(st);
});
