"use client";

import { useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, List, PieChart, Plus } from "lucide-react";
import { PageHeader } from "@/components/shell";
import { ResourceTable } from "@/components/resource-table";
import { useFetch, useFilter } from "@/components/providers";
import { useAnalytics } from "@/components/use-analytics";
import { ResourceForm } from "@/components/resource-form";
import { Bars, BarList, Card, Kpi, MiniTable, SplitBar } from "@/components/charts";
import { RESOURCE_MAP, type Row } from "@/lib/resources";
import { addDays, monthEnd, monthStart, todayISO, fmtPct } from "@/lib/format";

const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const DAYS = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const STATUS_DOT: Record<string, string> = { Posted: "var(--good)", Scheduled: "var(--s2)", Produksi: "var(--s5)", Review: "var(--s5)", Draft: "#c3c2b7", Ide: "#c3c2b7", Cancel: "var(--critical)" };

export default function ContentPage() {
  const [tab, setTab] = useState<"calendar" | "list" | "analytics">("calendar");
  const tabs = [
    { key: "calendar", label: "Kalender", icon: CalendarDays },
    { key: "list", label: "Daftar & Input Hasil", icon: List },
    { key: "analytics", label: "Analitik Konten", icon: PieChart },
  ] as const;
  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Konten" title="Content Plan" desc="Rencanakan konten (tanggal, channel, pilar, PIC), lalu isi hasilnya setelah tayang (like, comment, saved, followers). Engagement Rate = (Like + Comment + Saved) ÷ Followers." />
      <div className="tabs">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className="tab" data-on={tab === t.key}>
            <t.icon size={15} /> {t.label}
          </button>
        ))}
      </div>
      {tab === "calendar" && <Calendar />}
      {tab === "list" && <ResourceTable resourceKey="content" quickFilters={["channel", "pillar", "status"]} computedCols={["er", "on_time"]} />}
      {tab === "analytics" && <ContentAnalytics />}
    </div>
  );
}

function Calendar() {
  const f = useFilter();
  const [month, setMonth] = useState(() => monthStart(todayISO()));
  const from = month;
  const to = monthEnd(month);
  const bq = f.brand ? `&brand=${encodeURIComponent(f.brand)}` : "";
  const content = useFetch<{ rows: Row[] }>(`/api/r/content?from=${from}&to=${to}${bq}`);
  const events = useFetch<{ rows: Row[] }>(`/api/r/events?from=${addDays(from, -31)}&to=${to}${bq}`);
  const [editing, setEditing] = useState<{ row: Row | null; date?: string } | null>(null);
  const [editEvent, setEditEvent] = useState<Row | null>(null);

  const cells = useMemo(() => {
    const startDow = new Date(from + "T00:00:00Z").getUTCDay();
    const out: (string | null)[] = Array(startDow).fill(null);
    for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
    while (out.length % 7) out.push(null);
    return out;
  }, [from, to]);

  const byDate = (d: string) => (content.data?.rows ?? []).filter((r) => String(r.post_date).slice(0, 10) === d);
  const eventsOn = (d: string) => (events.data?.rows ?? []).filter((e) => String(e.event_date).slice(0, 10) <= d && String(e.end_date ?? e.event_date).slice(0, 10) >= d);
  const shift = (n: number) => {
    const dt = new Date(month + "T00:00:00Z");
    dt.setUTCMonth(dt.getUTCMonth() + n);
    setMonth(dt.toISOString().slice(0, 10));
  };
  const today = todayISO();
  const all = content.data?.rows ?? [];

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--line)] p-3">
        <button className="btn btn-sm" onClick={() => shift(-1)} aria-label="Bulan sebelumnya">
          <ChevronLeft size={15} />
        </button>
        <div className="min-w-[150px] text-center text-[15px] font-bold">
          {MONTHS[+month.slice(5, 7) - 1]} {month.slice(0, 4)}
        </div>
        <button className="btn btn-sm" onClick={() => shift(1)} aria-label="Bulan berikutnya">
          <ChevronRight size={15} />
        </button>
        <button className="btn btn-sm" onClick={() => setMonth(monthStart(todayISO()))}>
          Hari ini
        </button>
        <div className="ml-2 text-[12.5px] text-[var(--ink-2)]">
          {all.filter((r) => r.status === "Posted").length} tayang / {all.filter((r) => r.status !== "Cancel").length} rencana
        </div>
        <div className="ml-auto flex flex-wrap gap-3 text-[12px] text-[var(--ink-2)]">
          {Object.entries(STATUS_DOT).map(([k, c]) => (
            <span key={k} className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: c }} /> {k}
            </span>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto">
        <div className="grid min-w-[760px] grid-cols-7">
          {DAYS.map((d) => (
            <div key={d} className="border-b border-[var(--line)] bg-[var(--surface-2)] px-2 py-2 text-center text-[12px] font-semibold text-[var(--ink-2)]">
              {d}
            </div>
          ))}
          {cells.map((d, i) => (
            <div key={i} className={`group min-h-[118px] border-b border-r border-[var(--grid)] p-1.5 ${d ? "" : "bg-[var(--surface-2)]"}`}>
              {d && (
                <>
                  <div className="mb-1 flex items-center justify-between">
                    <span className={`grid h-6 w-6 place-items-center rounded-full text-[12px] font-semibold tnum ${d === today ? "bg-[var(--ink)] text-[#faf9f5]" : "text-[var(--ink-2)]"}`}>{+d.slice(8)}</span>
                    <button className="rounded p-0.5 text-[var(--muted)] opacity-0 hover:bg-[var(--surface-2)] hover:text-[var(--accent)] group-hover:opacity-100" onClick={() => setEditing({ row: null, date: d })} aria-label="Tambah konten">
                      <Plus size={14} />
                    </button>
                  </div>
                  {eventsOn(d).map((e) => (
                    <button key={`e${e.id}`} onClick={() => setEditEvent(e)} className="mb-1 block w-full truncate rounded bg-[var(--accent-soft)] px-1.5 py-0.5 text-left text-[11px] font-semibold text-[var(--accent-ink)]">
                      ★ {String(e.title)}
                    </button>
                  ))}
                  {byDate(d).map((c) => (
                    <button key={c.id} onClick={() => setEditing({ row: c })} className="mb-1 flex w-full items-center gap-1.5 rounded border border-[var(--line)] bg-white px-1.5 py-0.5 text-left text-[11.5px] hover:border-[var(--accent)]" title={`${c.title} · ${c.channel ?? ""} · ${c.status ?? ""}`}>
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: STATUS_DOT[String(c.status)] ?? "#d6d2c4" }} />
                      <span className="truncate">{String(c.title)}</span>
                    </button>
                  ))}
                </>
              )}
            </div>
          ))}
        </div>
      </div>
      {editing && (
        <ResourceForm resource={RESOURCE_MAP.content} row={editing.row} defaults={{ post_date: editing.date, status: "Ide", brand: f.brand || undefined }} onClose={() => setEditing(null)} onSaved={content.reload} />
      )}
      {editEvent && <ResourceForm resource={RESOURCE_MAP.events} row={editEvent} onClose={() => setEditEvent(null)} onSaved={events.reload} />}
    </div>
  );
}

function ContentAnalytics() {
  const { data: a } = useAnalytics();
  if (!a) return <div className="card p-8 text-center text-[var(--muted)]">Memuat…</div>;
  const k = a.kpis.content;
  const p = a.prevKpis.content;
  return (
    <div className="space-y-5">
      <div className="stat-grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Direncanakan" value={k.planned} prev={p.planned} format="number" />
        <Kpi label="Tayang" value={k.posted} prev={p.posted} format="number" />
        <Kpi label="Completion Rate" value={k.completionRate} prev={p.completionRate} format="percent" />
        <Kpi label="On-time Rate" value={k.onTimeRate} prev={p.onTimeRate} format="percent" />
        <Kpi label="Rata-rata ER" value={k.avgER} prev={p.avgER} format="percent" />
        <Kpi label="Total Reach" value={k.reach} prev={p.reach} format="number" />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Proporsi Posting per Channel">
          <SplitBar parts={a.contentByChannel.map((c) => ({ name: c.name, value: c.posted }))} />
          <div className="mt-5">
            <MiniTable cols={[{ key: "name", label: "Channel" }, { key: "planned", label: "Rencana", format: "number" }, { key: "posted", label: "Tayang", format: "number" }, { key: "avgER", label: "Rata ER", format: "percent" }, { key: "reach", label: "Reach", format: "number" }]} rows={a.contentByChannel} />
          </div>
        </Card>
        <Card title="Engagement Rate per Pilar Konten">
          <BarList items={a.contentByPillar.filter((x) => x.avgER !== null).map((x) => ({ name: x.name, value: x.avgER ?? 0, sub: `${x.posted} post` }))} format="percent" sub />
          <div className="mt-5 text-[12.5px] font-semibold text-[var(--ink-2)]">Jenis konten</div>
          <div className="mt-2">
            <BarList items={a.contentByType.filter((x) => x.avgER !== null).map((x) => ({ name: x.name, value: x.avgER ?? 0, sub: `${x.posted} post` }))} format="percent" color="var(--s3)" sub />
          </div>
        </Card>
        <Card title="Rata-rata Hari Posting" subtitle="Jumlah posting per hari dalam seminggu">
          <Bars data={a.weekdayStats} series={[{ key: "posts", label: "Posting" }]} />
          <p className="mt-2 text-[12px] text-[var(--muted)]">
            ER per hari: {a.weekdayStats.filter((w) => w.avgER !== null).map((w) => `${w.name} ${fmtPct(w.avgER, 1)}`).join(" · ") || "–"}
          </p>
        </Card>
        <Card title="Status Konten">
          <SplitBar parts={a.contentStatus} />
        </Card>
        <Card title="Top 5 Konten (Engagement Rate)">
          <MiniTable cols={[{ key: "title", label: "Judul" }, { key: "channel", label: "Channel" }, { key: "pillar", label: "Pilar" }, { key: "er", label: "ER", format: "percent" }]} rows={a.topContent} empty="Belum ada konten tayang dengan data followers" />
        </Card>
        <Card title="Bottom 5 Konten (Engagement Rate)">
          <MiniTable cols={[{ key: "title", label: "Judul" }, { key: "channel", label: "Channel" }, { key: "pillar", label: "Pilar" }, { key: "er", label: "ER", format: "percent" }]} rows={a.bottomContent} empty="Minimal 6 konten tayang untuk ranking bawah" />
        </Card>
      </div>
    </div>
  );
}
