import { NextResponse } from "next/server";
import { handle, HttpError, requireSession } from "@/lib/auth";
import { logActivity, q } from "@/lib/db";
import { normPhone } from "@/lib/phone";
import { todayISO } from "@/lib/format";

const SOURCES: Record<string, { table: string; label: string }> = {
  leads: { table: "leads", label: "WA Leads" },
  contacts: { table: "blast_contacts", label: "Kontak Blast" },
};

/** POST { resource: "leads"|"contacts", ids, reason } → add those rows' numbers to the do-not-contact list. */
export const POST = handle(async (req: Request) => {
  const s = await requireSession();
  const b = (await req.json()) as { resource?: string; ids?: number[]; reason?: string };
  const src = SOURCES[b.resource ?? ""];
  if (!src || !b.ids?.length) throw new HttpError(400, "Pilih data terlebih dahulu");
  const rows = await q<{ name: string | null; phone: string | null }>(`SELECT name, phone FROM ${src.table} WHERE org_id = $1 AND id = ANY($2::int[])`, [s.org, b.ids.map(Number)]);
  const existing = new Set((await q<{ phone: string }>(`SELECT phone FROM optouts WHERE org_id = $1`, [s.org])).map((r) => normPhone(r.phone)));
  let added = 0;
  for (const r of rows) {
    const phone = normPhone(r.phone);
    if (!phone || existing.has(phone)) continue;
    await q(`INSERT INTO optouts (org_id, added_date, phone, name, reason, source) VALUES ($1,$2,$3,$4,$5,$6)`, [s.org, todayISO(), phone, r.name, b.reason || "Minta berhenti", src.label]);
    existing.add(phone);
    added++;
  }
  await logActivity(s.org, s.name, "Tandai jangan dihubungi", `${added} nomor dari ${src.label}`);
  return NextResponse.json({ added, already: rows.length - added });
});
