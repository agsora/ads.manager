import { NextResponse } from "next/server";
import { handle, HttpError, requireSession } from "@/lib/auth";
import { aiConfigured, buildPastePrompt, DAILY_LIMIT, generateAdvice, lastAdvice, MODEL, usedToday } from "@/lib/ai-advice";
import { logActivity } from "@/lib/db";
import { monthEnd, monthStart, todayISO } from "@/lib/format";

export const maxDuration = 60;

const isDate = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(new Date(d + "T00:00:00Z").getTime());

/** GET → is AI on, usage today, and the last advice generated for this workspace. */
export const GET = handle(async () => {
  const s = await requireSession();
  return NextResponse.json({ configured: aiConfigured(), model: MODEL, used: await usedToday(s.org), limit: DAILY_LIMIT, last: await lastAdvice(s.org) });
});

/** PUT { from, to, brand, focus } → a ready-to-paste prompt for the Claude app (free path, no API call, no daily limit). */
export const PUT = handle(async (req: Request) => {
  const s = await requireSession();
  const b = (await req.json()) as { from?: string; to?: string; brand?: string | null; focus?: string };
  const t = todayISO();
  const from = b.from || monthStart(t);
  const to = b.to || monthEnd(t);
  if (!isDate(from) || !isDate(to)) throw new HttpError(400, "Rentang tanggal tidak valid");
  const prompt = await buildPastePrompt({
    orgId: s.org,
    from: from <= to ? from : to,
    to: from <= to ? to : from,
    brand: b.brand || null,
    focus: ["iklan", "leads", "konten", "blast", "biaya"].includes(b.focus ?? "") ? (b.focus as string) : "auto",
  });
  await logActivity(s.org, s.name, "Ringkasan untuk Claude disalin");
  return NextResponse.json({ prompt });
});

/** POST { from, to, brand, focus, previous: string[] } → ask the model for fresh advice on that period. */
export const POST = handle(async (req: Request) => {
  const s = await requireSession();
  const b = (await req.json()) as { from?: string; to?: string; brand?: string | null; focus?: string; previous?: string[] };
  const t = todayISO();
  const from = b.from || monthStart(t);
  const to = b.to || monthEnd(t);
  if (!isDate(from) || !isDate(to)) throw new HttpError(400, "Rentang tanggal tidak valid");
  const out = await generateAdvice({
    orgId: s.org,
    from: from <= to ? from : to,
    to: from <= to ? to : from,
    brand: b.brand || null,
    focus: ["iklan", "leads", "konten", "blast", "biaya"].includes(b.focus ?? "") ? (b.focus as string) : "auto",
    previousTitles: (b.previous ?? []).filter((x) => typeof x === "string").slice(0, 20).map((x) => x.slice(0, 160)),
  });
  await logActivity(s.org, s.name, "Saran AI dibuat", `${out.advice.saran.length} saran`);
  return NextResponse.json({ last: out, used: await usedToday(s.org), limit: DAILY_LIMIT });
});
