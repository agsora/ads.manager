"use client";

import { useState } from "react";
import { weightedKpiScore, type KpiScorecard, type KpiUnit } from "@/lib/kpi-engine";
import { fmtMoney, fmtNum } from "@/lib/format";
import type { Row } from "@/lib/resources";
import { Modal } from "./resource-form";

const STATUS: Record<string, string> = { achieved: "Tercapai", no_data: "Belum ada data", overdue: "Lewat tenggat", behind: "Tertinggal", below_target: "Di bawah target", upcoming: "Belum masuk periode", on_track: "Sesuai progres" };
const PRIORITY = ["overdue", "behind", "below_target", "no_data", "upcoming", "on_track", "achieved"];
const format = (v: number | null, unit: KpiUnit) => v === null ? "Belum ada data" : unit === "money" ? fmtMoney(v) : `${fmtNum(v, 2)}${unit === "percent" ? "%" : ""}`;
const tone = (s: string) => s === "achieved" ? "text-[var(--good-ink)]" : ["overdue", "behind", "below_target"].includes(s) ? "text-[var(--critical-ink)]" : "text-[var(--muted)]";

export function KpiBoard({ cards, onEdit, onDelete, onReview }: { cards: KpiScorecard[]; onEdit: (row: Row) => void; onDelete?: (row: Row) => void; onReview?: (row: Row, action: "lock" | "unlock") => void }) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const months = [...new Set(cards.map((c) => c.month))].sort().reverse();
  const [month, setMonth] = useState(months.includes(today.slice(0, 7)) ? today.slice(0, 7) : months[0] || "");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [detail, setDetail] = useState<KpiScorecard | null>(null);
  const scoped = cards.filter((c) => (!month || c.month === month) && Object.entries(filters).every(([k, v]) => !v || String(c.row[k] || "") === v) && (!search || [c.row.title, c.category, c.row.pic, c.row.brand].join(" ").toLowerCase().includes(search.toLowerCase())));
  const summary = weightedKpiScore(scoped);
  const groups = new Map<string, KpiScorecard[]>();
  for (const c of scoped) { const key = JSON.stringify([c.category, c.month]); groups.set(key, [...(groups.get(key) || []), c]); }
  const categories = [...groups.entries()].map(([key, targets]) => ({ key, category: targets[0].category, month: targets[0].month, targets, status: PRIORITY.find((s) => targets.some((t) => t.status === s))! }));
  const visible = categories.filter((g) => !status || g.status === status).sort((a, b) => PRIORITY.indexOf(a.status) - PRIORITY.indexOf(b.status) || a.category.localeCompare(b.category));
  const previous = (card: KpiScorecard) => {
    const date = new Date(`${card.month}-01T00:00:00Z`); date.setUTCMonth(date.getUTCMonth() - 1);
    const matches = cards.filter((c) => c.month === date.toISOString().slice(0, 7) && c.metrics.map((m) => m.key).join("|") === card.metrics.map((m) => m.key).join("|") && ["title", "brand", "branch", "pic", "content_category", "content_type", "metric_source", "metric_unit", "direction"].every((k) => String(c.row[k] || "") === String(card.row[k] || "")));
    return matches.length === 1 ? matches[0].score : null;
  };
  const exportCsv = () => {
    const escape = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""').replace(/^[=+\-@]/, "'$&")}"`;
    const rows: unknown[][] = [["Bulan", "Kategori", "Judul", "Brand", "Cabang", "PIC", "Indikator", "Arah", "Aktual", "Target", "Satuan", "Skor", "Status", "Bobot", "Wajib"]];
    for (const g of visible) for (const c of g.targets) for (const m of c.metrics) rows.push([c.month, c.category, c.row.title, c.row.brand, c.row.branch, c.row.pic, m.label, m.lower ? "Maksimal" : "Minimal", m.actual, m.target, m.unit, m.score, STATUS[c.status], c.weight, c.mandatory ? "Ya" : ""]);
    const url = URL.createObjectURL(new Blob(["\uFEFF" + rows.map((r) => r.map(escape).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `evaluasi-kpi-${month || "semua"}.csv`; a.click(); URL.revokeObjectURL(url);
  };
  return <div className="space-y-4">
    <div className="flex flex-wrap gap-2">
      <input className="input !w-auto" placeholder="Cari judul, kategori, PIC…" aria-label="Cari KPI" value={search} onChange={(e) => setSearch(e.target.value)} />
      <select className="input !w-auto" aria-label="Bulan KPI" value={month} onChange={(e) => setMonth(e.target.value)}><option value="">Semua bulan</option>{months.map((v) => <option key={v}>{v}</option>)}</select>
      {Object.entries({ kpi_category: "Kategori KPI", content_category: "Kategori konten", content_type: "Jenis konten", branch: "Cabang", pic: "PIC" }).map(([k, label]) => <select key={k} className="input !w-auto" aria-label={label} value={filters[k] || ""} onChange={(e) => setFilters((f) => ({ ...f, [k]: e.target.value }))}><option value="">{label}: semua</option>{[...new Set(cards.map((c) => String(c.row[k] || "")).filter(Boolean))].sort().map((v) => <option key={v}>{v}</option>)}</select>)}
      <select className="input !w-auto" aria-label="Status kategori" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Semua status kategori</option>{Object.entries(STATUS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}</select>
      <button className="btn btn-sm" onClick={exportCsv}>Ekspor evaluasi CSV</button>
    </div>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[
      { label: "Skor berbobot", value: summary.score === null ? "—" : `${fmtNum(summary.score, 1)}%` },
      { label: "KPI tercapai", value: `${scoped.filter((c) => c.status === "achieved").length} / ${scoped.length}` },
      { label: "Kategori tercapai", value: `${categories.filter((c) => c.status === "achieved").length} / ${categories.length}` },
      { label: "KPI wajib belum tercapai", value: String(summary.mandatoryPending) },
    ].map((s) => <div key={s.label} className="rounded-xl bg-[var(--surface-2)] p-3"><p className="text-xs text-[var(--muted)]">{s.label}</p><p className="serif mt-1 text-2xl">{s.value}</p></div>)}</div>
    <p className="text-xs text-[var(--muted)]">Ringkasan mengikuti bulan, kategori, PIC, dan cabang; filter status menyaring daftar di bawah. Skor tersedia untuk {summary.measured} dari {summary.total} KPI. Setiap skor dibatasi 100%; KPI tanpa data belum masuk rata-rata. Kategori tercapai jika seluruh KPI dalam kategori dan bulan itu terpenuhi.</p>
    {!visible.length && <p className="py-5 text-sm text-[var(--muted)]">Belum ada KPI yang sesuai. Tambahkan KPI atau sesuaikan filter.</p>}
    {visible.map((g) => <section key={g.key} className="rounded-xl border border-[var(--grid)] p-4">
      <div className="mb-3 flex flex-wrap justify-between gap-2"><div><h3 className="text-lg font-semibold">{g.category}</h3><p className="text-xs text-[var(--muted)]">{g.month} · {g.targets.filter((c) => c.status === "achieved").length} dari {g.targets.length} KPI tercapai</p></div><span className={`chip self-start ${tone(g.status)}`}>{STATUS[g.status]}</span></div>
      <div className="grid gap-3 xl:grid-cols-2">{g.targets.map((c) => <article key={c.row.id} className="rounded-lg bg-[var(--surface-2)] p-4">
        <div className="flex flex-wrap justify-between gap-2"><h4 className="font-semibold">{String(c.row.title || c.row.brand || "Target KPI")}</h4><span className={`text-xs ${tone(c.status)}`}>{STATUS[c.status]}</span></div>
        <div className="mt-2 flex flex-wrap gap-1.5 text-xs">{[c.row.brand, c.row.branch, c.row.pic ? `PIC: ${c.row.pic}` : null, c.row.content_type, c.row.kpi_category, c.mandatory ? "KPI wajib" : null, c.row.weight ? `Bobot ${c.weight}` : null].filter(Boolean).map((v, i) => <span className="chip" key={i}>{String(v)}</span>)}</div>
        {c.metrics.map((m) => <div key={m.key} className="mt-4">
          <div className="flex flex-wrap justify-between gap-2 text-sm"><span>{m.label}</span><strong>{format(m.actual, m.unit)}</strong></div>
          <p className="mt-1 text-xs text-[var(--muted)]">Target {m.lower ? "maksimal" : "minimal"} {format(m.target, m.unit)}{m.score !== null ? ` · Skor ${fmtNum(m.score, 1)}%` : ""}</p>
          {m.score !== null && <progress className="mt-1 h-2 w-full" style={{ accentColor: m.achieved ? "var(--good)" : "var(--accent)" }} value={m.score} max={100} aria-label={`${String(c.row.title || c.category)}: ${m.label}`} />}
          {m.numerator !== undefined && <p className="mt-1 text-xs">{fmtNum(m.numerator)} berhasil dari {fmtNum(m.denominator)} keseluruhan</p>}
          <p className={`mt-1 text-xs ${tone(m.achieved ? "achieved" : c.status)}`}>{m.actual === null ? "Hasil belum tersedia; periksa sumber data atau isi aktual manual." : m.achieved ? "Target tercapai" : `${m.lower ? "Melebihi batas" : "Masih kurang"} ${format(m.gap, m.unit)}${m.unit === "percent" ? " (poin persentase)" : ""}`}</p>
          {m.expected !== null && c.month === today.slice(0, 7) && <p className="mt-1 text-xs text-[var(--muted)]">Patokan progres merata sampai hari ini: {format(m.expected, m.unit)}</p>}
          {m.dailyNeeded !== null && m.dailyNeeded > 0 && c.month === today.slice(0, 7) && <p className="mt-1 text-xs text-[var(--muted)]">Perlu {format(m.dailyNeeded, m.unit)} per hari · {c.daysLeft} hari tersisa.</p>}
        </div>)}
        {c.score !== null && previous(c) !== null && <p className="mt-3 text-xs text-[var(--muted)]">Skor bulan lalu: {fmtNum(previous(c), 1)}% · Selisih {fmtNum(c.score - previous(c)!, 1)} poin{c.month === today.slice(0, 7) ? " (bulan ini masih berjalan)" : ""}</p>}
        {!!c.row.notes && <p className="mt-3 whitespace-pre-wrap text-sm">{String(c.row.notes)}</p>}
        {!!c.row.review_locked && <p className="mt-3 text-xs text-[var(--muted)]">Evaluasi terkunci · {String(c.row.reviewed_by || "Admin")} · Hasil disimpan saat penguncian.</p>}
        <div className="mt-4 flex flex-wrap gap-2"><button className="btn btn-sm" onClick={() => setDetail(c)}>Rincian & sumber</button>{!c.row.review_locked && <><button className="btn btn-sm" onClick={() => onEdit(c.row)}>Edit KPI</button>{onDelete && <button className="btn btn-sm btn-danger" onClick={() => onDelete(c.row)}>Hapus</button>}</>}{onReview && (c.row.review_locked ? <button className="btn btn-sm" onClick={() => onReview(c.row, "unlock")}>Buka evaluasi</button> : c.month < today.slice(0, 7) && <button className="btn btn-sm" onClick={() => onReview(c.row, "lock")}>Kunci evaluasi</button>)}</div>
      </article>)}</div>
    </section>)}
    {detail && <Modal title={String(detail.row.title || "Rincian KPI")} subtitle={`${detail.category} · ${detail.month}`} onClose={() => setDetail(null)} wide><div className="space-y-5">{detail.metrics.map((m) => <section key={m.key}>
      <h3 className="font-semibold">{m.label}</h3><p className="mt-1 text-sm">{format(m.actual, m.unit)} · Target {m.lower ? "maksimal" : "minimal"} {format(m.target, m.unit)}</p><p className="mt-2 text-xs text-[var(--muted)]">{m.basis}</p>
      {m.evidence.length > 0 && <div className="mt-3 max-h-72 overflow-auto"><table className="data"><thead><tr><th>Data yang dihitung</th><th>Tanggal</th><th>Status</th></tr></thead><tbody>{m.evidence.map((e) => <tr key={`${e.resource}-${e.id}`}><td><a className="text-[var(--accent-ink)] underline" href={e.resource === "content" ? `/content?hasil=${e.id}` : `/${e.resource}`}>{e.title}</a></td><td>{e.date}</td><td>{e.status}</td></tr>)}</tbody></table></div>}
    </section>)}</div></Modal>}
  </div>;
}
