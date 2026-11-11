"use client";

import { useMemo, useState } from "react";
import { MessageCircle, Pencil } from "lucide-react";
import { PageHeader } from "@/components/shell";
import { api, useFetch, useFilter, useToast } from "@/components/providers";
import { ResourceForm } from "@/components/resource-form";
import { Chip } from "@/components/cells";
import { RESOURCE_MAP, isFinishedLead, type Row } from "@/lib/resources";
import { normPhone } from "@/lib/phone";
import { addDays, diffDays, fmtDate, todayISO } from "@/lib/format";

const COLS = [
  { stage: 1, title: "Follow Up 1", hint: "H+3 – H+7 sejak chat", due: 3 },
  { stage: 2, title: "Follow Up 2", hint: "H+7 – H+14", due: 7 },
  { stage: 3, title: "Follow Up 3", hint: "H+14 – H+30", due: 14 },
  { stage: 4, title: "Menunggu Keputusan", hint: "Sudah 3x follow up", due: 30 },
  { stage: 5, title: "Follow Up Manual", hint: "Lead Pending yang Anda pilih sendiri", due: 0 },
];
const MANUAL = 5;
const isManual = (r: Row) => String(r.manual_followup ?? "") === "Ya";
const isPending = (r: Row) => String(r.final_status ?? "").trim().toLowerCase() === "pending";

export default function FollowUpBoard() {
  const f = useFilter();
  const toast = useToast();
  const today = todayISO();
  const { data: stopData } = useFetch<{ rows: Row[] }>("/api/r/optouts");
  const stopSet = useMemo(() => new Set((stopData?.rows ?? []).map((o) => normPhone(o.phone))), [stopData]);
  const bq = f.brand ? `&brand=${encodeURIComponent(f.brand)}` : "";
  const { data, reload } = useFetch<{ rows: Row[] }>(`/api/r/leads?from=${addDays(today, -90)}&to=${today}${bq}`);
  const [editing, setEditing] = useState<Row | null>(null);
  const [onlyDue, setOnlyDue] = useState(false);

  const open = useMemo(
    () =>
      (data?.rows ?? [])
        .filter((r) => !isFinishedLead(r))
        .map((r) => {
          const age = diffDays(String(r.chat_date).slice(0, 10), today);
          const natural = !r.followup_1 ? 1 : !r.followup_2 ? 2 : !r.followup_3 ? 3 : 4;
          // lead yang dipilih ke Follow Up Manual keluar dari kolom tahapnya
          const manual = isManual(r);
          const fuDate = manual && r.manual_followup_date ? String(r.manual_followup_date).slice(0, 10) : "";
          // di kolom manual, jatuh tempo mengikuti tanggal yang diisi sendiri (bukan umur lead)
          return { r, age, stage: manual ? MANUAL : natural, due: manual ? !!fuDate && fuDate <= today : age >= COLS[natural - 1].due, fuDate };
        })
        .filter((x) => !onlyDue || x.due)
        .sort((a, b) => Number(b.due) - Number(a.due) || (a.stage === MANUAL && b.stage === MANUAL ? (a.fuDate || "9999").localeCompare(b.fuDate || "9999") : 0) || (String(b.r.segment).toUpperCase() === "HOT" ? 1 : 0) - (String(a.r.segment).toUpperCase() === "HOT" ? 1 : 0) || b.age - a.age),
    [data, today, onlyDue],
  );

  // pilihan dropdown Follow Up Manual: hanya lead berstatus Pending yang belum ada di kolom manual
  const pendingChoices = useMemo(
    () => (data?.rows ?? []).filter((r) => isPending(r) && !isManual(r)).sort((a, b) => String(b.chat_date).localeCompare(String(a.chat_date))),
    [data],
  );
  const setManual = async (r: Row, on: boolean) => {
    try {
      await api(`/api/r/leads/${r.id}`, "PUT", on ? { manual_followup: "Ya" } : { manual_followup: null, manual_followup_date: null });
      toast(on ? `${r.name ?? "Lead"} masuk Follow Up Manual` : `${r.name ?? "Lead"} dikeluarkan dari Follow Up Manual`);
      reload();
    } catch (e) {
      toast((e as Error).message, "err");
    }
  };

  const setFuDate = async (r: Row, date: string) => {
    try {
      await api(`/api/r/leads/${r.id}`, "PUT", { manual_followup_date: date || null });
      toast(date ? `${r.name ?? "Lead"}: follow up ${fmtDate(date)}` : "Tanggal follow up dihapus");
      reload();
    } catch (e) {
      toast((e as Error).message, "err");
    }
  };
  /** hitung mundur ke tanggal follow up manual */
  const countdown = (date: string) => {
    const d = diffDays(today, date);
    return d > 0 ? { text: `${d} hari lagi`, late: false } : d === 0 ? { text: "Hari ini", late: true } : { text: `Terlambat ${-d} hari`, late: true };
  };

  const countdownTone = (date: string) => {
    const d = diffDays(today, date);
    return d <= 0 ? "!border-[#e4b7ab] !bg-[#fbefec] !text-[var(--critical-ink)]" : d <= 2 ? "!border-[#e8d3a0] !bg-[#fbf1dc] !text-[#8a5a12]" : "!border-[#c9dbc0] !bg-[#eef5e9] !text-[var(--good-ink)]";
  };

  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Leads" title="Papan Follow Up" desc="Semua lead terbuka 90 hari terakhir, dikelompokkan berdasarkan tahap follow up. Kartu merah = sudah jatuh tempo. Klik ✎ untuk menulis hasil follow up dan mengubah status lead.">
        <label className="flex items-center gap-2 text-[13px]">
          <input type="checkbox" checked={onlyDue} onChange={(e) => setOnlyDue(e.target.checked)} /> Hanya yang jatuh tempo
        </label>
      </PageHeader>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {COLS.map((c) => {
          const items = open.filter((x) => x.stage === c.stage);
          return (
            <div key={c.stage} className="rounded-xl bg-[var(--sidebar)] p-3">
              <div className="mb-3 flex items-baseline justify-between px-1">
                <div className="min-w-0">
                  <div className="serif text-[17px] leading-tight">{c.title}</div>
                  <div className="text-[11.5px] text-[var(--muted)]">{c.hint}</div>
                </div>
                <span className="chip shrink-0 whitespace-nowrap !bg-white">
                  {items.length} · {items.filter((x) => x.due).length} jatuh tempo
                </span>
              </div>
              {c.stage === MANUAL && (
                <select
                  className="input mb-3 !h-9 w-full !text-[12.5px]"
                  value=""
                  aria-label="Tambah lead Pending ke Follow Up Manual"
                  onChange={(e) => {
                    const r = pendingChoices.find((x) => String(x.id) === e.target.value);
                    if (r) setManual(r, true);
                  }}
                >
                  <option value="">{pendingChoices.length ? "+ Pilih lead Pending…" : "Tidak ada lead Pending"}</option>
                  {pendingChoices.map((r) => (
                    <option key={r.id} value={String(r.id)}>
                      {String(r.name ?? r.phone ?? "(tanpa nama)")} · {fmtDate(r.chat_date)}
                    </option>
                  ))}
                </select>
              )}
              <div className="space-y-2.5">
                {items.slice(0, 60).map(({ r, age, due, fuDate }) => {
                  const stopped = stopSet.has(normPhone(r.phone));
                  const wa = stopped ? "" : String(r.phone ?? "").replace(/\D/g, "").replace(/^0/, "62");
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
                      {c.stage === MANUAL && (
                        <div className="mt-2.5 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] p-2">
                          <div className="flex items-center justify-between gap-2">
                            <label className="text-[11.5px] font-semibold uppercase tracking-wide text-[var(--muted)]" htmlFor={`fu-${r.id}`}>
                              Follow up kembali
                            </label>
                            {fuDate ? (
                              <span className={`chip shrink-0 whitespace-nowrap ${countdownTone(fuDate)}`}>{countdown(fuDate).text}</span>
                            ) : (
                              <span className="shrink-0 whitespace-nowrap text-[11.5px] text-[var(--muted)]">belum dijadwalkan</span>
                            )}
                          </div>
                          <input id={`fu-${r.id}`} type="date" className="input mt-1.5 !h-8 w-full !px-2 !text-[12.5px]" min={today} value={fuDate} onChange={(e) => setFuDate(r, e.target.value)} />
                        </div>
                      )}
                      <div className="mt-2.5 space-y-1.5">
                        {stopped && <div className="chip !border-[#e4b7ab] !bg-[#fbefec] !text-[var(--critical-ink)]">Jangan dihubungi</div>}
                        {wa && (
                          <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" className="btn btn-sm !h-8 w-full !justify-center !text-[12.5px] text-[var(--good-ink)]">
                            <MessageCircle size={14} /> Chat WhatsApp
                          </a>
                        )}
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
