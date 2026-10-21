import { NextResponse } from "next/server";
import { handle, HttpError, requireSession } from "@/lib/auth";
import { CHUNK, sendChunk } from "@/lib/drive";

export const maxDuration = 60;

/** Step 2: one chunk (≤ 3.5 MB) of the file body; the last chunk returns the finished Drive file. */
export const POST = handle(async (req: Request) => {
  const s = await requireSession();
  const u = new URL(req.url);
  const ticket = u.searchParams.get("ticket") ?? "";
  const start = Number(u.searchParams.get("start"));
  const data = Buffer.from(await req.arrayBuffer());
  if (!Number.isFinite(start) || start < 0 || !data.length) throw new HttpError(400, "Potongan file tidak valid");
  if (data.length > CHUNK) throw new HttpError(400, "Potongan file terlalu besar");
  try {
    return NextResponse.json(await sendChunk(ticket, s.uid, start, data));
  } catch (e) {
    throw new HttpError(502, (e as Error).message);
  }
});
