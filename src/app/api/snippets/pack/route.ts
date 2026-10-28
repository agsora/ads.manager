import { NextResponse } from "next/server";
import { handle, requireSession } from "@/lib/auth";
import { logActivity, q } from "@/lib/db";
import { SNIPPET_PACK } from "@/lib/snippet-pack";

/** POST → adds the ready-made template pack to this workspace; titles that already exist are skipped. */
export const POST = handle(async () => {
  const s = await requireSession(["owner", "admin", "superadmin"]);
  const have = new Set((await q<{ title: string }>(`SELECT title FROM snippets WHERE org_id = $1`, [s.org])).map((r) => r.title.trim().toLowerCase()));
  let added = 0;
  for (const t of SNIPPET_PACK) {
    if (have.has(t.title.trim().toLowerCase())) continue;
    await q(`INSERT INTO snippets (org_id, title, kind, channel, body, tags, uses) VALUES ($1, $2, $3, $4, $5, $6, 0)`, [s.org, t.title, t.kind, t.channel ?? null, t.body, t.tags ?? null]);
    added++;
  }
  await logActivity(s.org, s.name, "Isi paket template caption", `${added} template ditambahkan`);
  return NextResponse.json({ added, skipped: SNIPPET_PACK.length - added, total: SNIPPET_PACK.length });
});
