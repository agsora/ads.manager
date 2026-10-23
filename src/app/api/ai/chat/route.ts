import { NextResponse } from "next/server";
import { handle, HttpError, requireSession } from "@/lib/auth";
import { allowPII, chat, CHAT_DAILY_LIMIT, chatUsedToday, setAllowPII, type ChatTurn } from "@/lib/ai-chat";
import { logActivity } from "@/lib/db";

export const maxDuration = 60;

/** GET → is chat available, privacy setting, usage today. */
export const GET = handle(async () => {
  const s = await requireSession();
  return NextResponse.json({ configured: !!process.env.GEMINI_API_KEY, pii: await allowPII(s.org), used: await chatUsedToday(s.org), limit: CHAT_DAILY_LIMIT, canChangePrivacy: ["owner", "admin", "superadmin"].includes(s.role) });
});

/** PUT { pii } → owner/admin decides whether the AI may see customer names and numbers. */
export const PUT = handle(async (req: Request) => {
  const s = await requireSession(["owner", "admin"]);
  const b = (await req.json()) as { pii?: boolean };
  await setAllowPII(s.org, !!b.pii);
  await logActivity(s.org, s.name, b.pii ? "AI boleh melihat nama & nomor" : "AI hanya melihat data tersamar");
  return NextResponse.json({ pii: !!b.pii });
});

/** POST { messages: [{role, text}] } → the AI answers, reading the workspace data with read-only tools. */
export const POST = handle(async (req: Request) => {
  const s = await requireSession();
  const b = (await req.json()) as { messages?: ChatTurn[] };
  const messages = (b.messages ?? []).filter((m) => (m.role === "user" || m.role === "model") && typeof m.text === "string" && m.text.trim());
  if (!messages.length) throw new HttpError(400, "Tulis pertanyaan terlebih dahulu");
  const out = await chat(s.org, messages);
  return NextResponse.json({ ...out, used: await chatUsedToday(s.org), limit: CHAT_DAILY_LIMIT });
});
