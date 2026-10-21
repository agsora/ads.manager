"use client";

import { useMemo, useState } from "react";
import { MessageCircle, Pencil } from "lucide-react";
import { PageHeader } from "@/components/shell";
import { api, useFetch, useFilter, useToast } from "@/components/providers";
import { ResourceForm } from "@/components/resource-form";
import { Chip } from "@/components/cells";
import { RESOURCE_MAP, type Row } from "@/lib/resources";
import { addDays, diffDays, fmtDate, todayISO } from "@/lib/format";

const COLS = [
  { stage: 1, title: "Follow Up 1", hint: "H+3 – H+7 sejak chat", due: 3 },
  { stage: 2, title: "Follow Up 2", hint: "H+7 – H+14", due: 7 },
  { stage: 3, title: "Follow Up 3", hint: "H+14 – H+30", due: 14 },
  { stage: 4, title: "Menunggu Keputusan", hint: "Sudah 3x follow up", due: 30 },
];

export default function FollowUpBoard() {
  const f = useFilter();
  const toast = useToast();
  const today = todayISO();
  const bq = f.brand ? `&brand=${encodeURIComponent(f.brand)}` : "";
  const { data, reload } = useFetch<{ rows: Row[] }>(`/api/r/leads?from=${addDays(today, -90)}&to=${today}${bq}`);
  const [editing, setEditing] = useState<Row | null>(null);
  const [onlyDue, setOnlyDue] = useState(false);

  const open = useMemo(
    () =>
      (data?.rows ?? [])
        .filter((r) => !["Deal", "Cancel", "Ghosting"].includes(String(r.final_status)))
        .map((r) => {
          const age = diffDays(String(r.chat_date).slice(0, 10), today);
          const stage = !r.followup_1 ? 1 : !r.followup_2 ? 2 : !r.followup_3 ? 3 : 4;
          return { r, age, stage, due: age >= COLS[stage - 1].due };
        })
        .filter((x) => !onlyDue || x.due)
        .sort((a, b) => Number(b.due) - Number(a.due) || (String(b.r.segment).toUpperCase() === "HOT" ? 1 : 0) - (String(a.r.segment).toUpperCase() === "HOT" ? 1 : 0) || b.age - a.age),
    [data, today, onlyDue],
  );

  const close = async (r: Row, status: string) => {
    try {
      await api(`/api/r/leads/${r.id}`, "PUT", { final_status: status });
      toast(`${r.name ?? "Lead"} → ${status}`);
      reload();
    } catch (e) {
      toast((e as Error).message, "err");
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Leads" title="Papan Follow Up" desc="Semua lead terbuka 90 hari terakhir, dikelompokkan berdasarkan tahap follow up. Kartu merah = sudah jatuh tempo. Klik ✎ untuk menulis hasil follow up; tombol status untuk menutup lead.">
        <label className="flex items-center gap-2 text-[13px]">
          <input type="checkbox" checked={onlyDue} onChange={(e) => setOnlyDue(e.target.checked)} /> Hanya yang jatuh tempo
        </label>
      </PageHeader>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {COLS.map((c) => {
          const items = open.filter((x) => x.stage === c.stage);
          return (
            <div key={c.stage} className="rounded-xl bg-[var(--sidebar)] p-3">
              <div className="mb-3 flex items-baseline justify-between px-1">
                <div>
                  <div className="serif text-[17px]">{c.title}</div>
                  <div className="text-[11.5px] text-[var(--muted)]">{c.hint}</div>
                </div>
                <span className="chip !bg-white">
                  {items.length} · {items.filter((x) => x.due).length} jatuh tempo
                </span>
              </div>
              <div className="space-y-2.5">
                {items.slice(0, 60).map(({ r, age, due }) => {
                  const wa = String(r.phone ?? "").replace(/\D/g, "").replace(/^0/, "62");
                  return (
                    <div key={r.id} className={`rounded-xl border bg-white p-3 ${due ? "border-[#e2b7a5]" : "border-[var(--line)]"}`}>
                      <div className="flex items-center gap-2">
                        {r.segment ? <Chip value={String(r.segment)} /> : null}
                        <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold">{String(r.name ?? r.phone ?? "(tanpa nama)")}</span>
                        <button className="rounded p-1 text-[var(--muted)] hover:bg-[var(--surface-2)]" onClick={() => setEditing(r)} aria-label="Isi follow up">
                          <Pencil size={14} />
                        </button>
                      </div>
                      <div className="mt-1 text-[12px] text-[var(--ink-2)]">
                        {fmtDate(r.chat_date)} · <span className={due ? "font-semibold text-[var(--critical-ink)]" : ""}>{age} hari</span> · {String(r.source ?? "–")}
                        {r.brand ? ` · ${r.brand}` : ""}
                      </div>
                      {r.need ? <div className="mt-1.5 line-clamp-2 text-[12.5px]">{String(r.need)}</div> : null}
                      {r.followup_1 ? <div className="mt-1.5 line-clamp-2 text-[12px] text-[var(--muted)]">Terakhir: {String(r.followup_3 ?? r.followup_2 ?? r.followup_1)}</div> : null}
                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        {wa && (
                          <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" className="btn btn-sm !h-7 !px-2 !text-[12px] text-[var(--good-ink)]">
                            <MessageCircle size={13} /> WA
                          </a>
                        )}
                        <button className="btn btn-sm !h-7 !px-2 !text-[12px]" onClick={() => close(r, "Deal")}>Deal</button>
                        <button className="btn btn-sm !h-7 !px-2 !text-[12px]" onClick={() => close(r, "Pending")}>Pending</button>
                        <button className="btn btn-sm !h-7 !px-2 !text-[12px]" onClick={() => close(r, "Ghosting")}>Ghosting</button>
                        <button className="btn btn-sm !h-7 !px-2 !text-[12px]" onClick={() => close(r, "Cancel")}>Cancel</button>
                      </div>
                    </div>
                  );
                })}
                {!items.length && <div className="rounded-xl border border-dashed border-[#d6d2c4] p-4 text-center text-[12.5px] text-[var(--muted)]">Kosong</div>}
              </div>
            </div>
          );
        })}
      </div>
      {editing && <ResourceForm resource={RESOURCE_MAP.leads} row={editing} onClose={() => setEditing(null)} onSaved={reload} />}
    </div>
  );
}
