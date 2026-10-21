import { NextResponse } from "next/server";
import { handle, requireSession } from "@/lib/auth";
import { q } from "@/lib/db";

export const GET = handle(async (req: Request) => {
  const s = await requireSession();
  const u = new URL(req.url);
  const limit = Math.min(Number(u.searchParams.get("limit")) || 30, 200);
  const unreadOnly = u.searchParams.get("unread") === "1";
  const [items, [{ count }]] = await Promise.all([
    q(
      `SELECT id, category, title, body, link, actor, read_at, created_at FROM notifications
       WHERE user_id = $1 AND org_id = $2 ${unreadOnly ? "AND read_at IS NULL" : ""} ORDER BY created_at DESC LIMIT ${limit}`,
      [s.uid, s.org],
    ),
    q<{ count: number }>(`SELECT count(*)::int AS count FROM notifications WHERE user_id = $1 AND org_id = $2 AND read_at IS NULL`, [s.uid, s.org]),
  ]);
  return NextResponse.json({ items, unread: count });
});

/** Mark as read: { ids: [...] } or { all: true }. */
export const PUT = handle(async (req: Request) => {
  const s = await requireSession();
  const b = (await req.json()) as { ids?: number[]; all?: boolean };
  if (b.all) await q(`UPDATE notifications SET read_at = now() WHERE user_id = $1 AND org_id = $2 AND read_at IS NULL`, [s.uid, s.org]);
  else if (b.ids?.length) await q(`UPDATE notifications SET read_at = now() WHERE user_id = $1 AND id = ANY($2::int[])`, [s.uid, b.ids.map(Number)]);
  return NextResponse.json({ ok: true });
});

export const DELETE = handle(async () => {
  const s = await requireSession();
  await q(`DELETE FROM notifications WHERE user_id = $1 AND org_id = $2 AND read_at IS NOT NULL`, [s.uid, s.org]);
  return NextResponse.json({ ok: true });
});
