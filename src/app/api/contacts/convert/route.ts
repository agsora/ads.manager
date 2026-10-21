import { NextResponse } from "next/server";
import { handle, HttpError, requireSession } from "@/lib/auth";
import { logActivity, q } from "@/lib/db";
import { activityEvent } from "@/lib/events";
import { RESOURCE_MAP } from "@/lib/resources";
import { insertMany } from "@/lib/repo";
import { fmtMoney, todayISO } from "@/lib/format";

const localPhone = (v: unknown) => String(v ?? "").replace(/\D/g, "").replace(/^62/, "0");

/** Turn blast contacts who replied / are interested into WA Leads (skips ones already in leads). */
export const POST = handle(async (req: Request) => {
  const s = await requireSession();
  const { ids } = (await req.json()) as { ids: number[] };
  if (!ids?.length) throw new HttpError(400, "Pilih kontak terlebih dahulu");
  const contacts = await q<Record<string, unknown>>(`SELECT * FROM blast_contacts WHERE org_id=$1 AND id = ANY($2::int[])`, [s.org, ids.map(Number)]);
  const existing = new Set(
    (await q<{ phone: string }>(`SELECT phone FROM leads WHERE org_id=$1 AND phone IS NOT NULL`, [s.org])).map((r) => localPhone(r.phone)),
  );
  const today = todayISO();
  const rows = contacts
    .filter((c) => !existing.has(localPhone(c.phone ?? c.phone_official)))
    .map((c) => {
      const deal = c.status === "Deal";
      return Object.fromEntries(
        RESOURCE_MAP.leads.fields.map((f) => [
          f.key,
          {
            chat_date: today,
            brand: c.brand,
            name: c.name,
            phone: localPhone(c.phone ?? c.phone_official) || null,
            customer_type: "Repeat Order",
            source: "Whatsapp Blast",
            campaign_ref: c.batch ?? null,
            segment: deal ? "HOT" : c.status === "Tertarik" ? "WARM" : "COLD",
            initial_status: deal ? "Deal" : "Follow Up",
            final_status: deal ? "Deal" : "Follow-up",
            need: [
              c.unit_type ? `Unit ${c.unit_type}${c.year ? ` ${c.year}` : ""}` : null,
              c.official_rec || c.recommended ? `rekomendasi plafon ${fmtMoney(Number(c.official_rec ?? c.recommended))}` : null,
              c.contract_no ? `kontrak ${c.contract_no}` : null,
              c.notes ? String(c.notes) : null,
            ].filter(Boolean).join(" · "),
            deal_value: deal ? c.official_rec ?? c.recommended ?? null : null,
          }[f.key] ?? null,
        ]),
      );
    });
  const n = await insertMany(s.org, RESOURCE_MAP.leads, rows);
  await logActivity(s.org, s.name, "Kontak blast → leads", `${n} kontak`);
  if (n) activityEvent(s, `${n} kontak blast masuk WA Leads`, `Dipindahkan oleh ${s.name}. Segera follow up yang tertarik.`, "/leads/followup", "activity", req);
  return NextResponse.json({ ok: true, created: n, skipped: contacts.length - n });
});
