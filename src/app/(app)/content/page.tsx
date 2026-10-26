"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BarChart3, CalendarDays, Check, Link2, ChevronLeft, ChevronRight, ClipboardList, PieChart, Plus, RotateCcw } from "lucide-react";
import { PageHeader } from "@/components/shell";
import { ResourceTable } from "@/components/resource-table";
import { api, useFetch, useFilter, useToast } from "@/components/providers";
import { useAnalytics } from "@/components/use-analytics";
import { ResourceForm } from "@/components/resource-form";
import { ContentDrawer } from "@/components/content-drawer";
import { uploadToDrive, thumbUrl, isImage, type DriveFileLite } from "@/lib/drive-client";
import { Paperclip } from "lucide-react";
import { Bars, BarList, Card, Kpi, MiniTable, SplitBar } from "@/components/charts";
import { RESOURCE_MAP, type Row } from "@/lib/resources";
import { addDays, monthEnd, monthStart, todayISO, fmtPct } from "@/lib/format";

const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const DAYS = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const STATUS_DOT: Record<string, string> = { Posted: "var(--good)", Scheduled: "var(--s2)", Produksi: "var(--s5)", Review: "var(--s5)", Draft: "#c3c2b7", Ide: "#c3c2b7", Cancel: "var(--critical)" };

/** Reads ?hasil=<id> (from a performance-check notification), then tells the page to open that content's results form. */
function LinkOpener({ onOpen }: { onOpen: (id: number) => void }) {
  const sp = useSearchParams();
  const router = useRouter();
  const id = Number(sp.get("hasil"));
  useEffect(() => {
    if (!id) return;
    onOpen(id);
    router.replace("/content"); // so a refresh does not reopen it
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  return null;
}

export default function ContentPage() {
  const [tab, setTab] = useState<"calendar" | "plan" | "results" | "analytics">("calendar");
  const [openId, setOpenId] = useState<number | null>(null);
  const tabs = [
    { key: "calendar", label: "Kalender", icon: CalendarDays },
    { key: "plan", label: "Planning", icon: ClipboardList },
    { key: "results", label: "Hasil", icon: BarChart3 },
    { key: "analytics", label: "Analitik", icon: PieChart },
  ] as const;
  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Konten" title="Content Plan" desc="Planning = apa yang akan diposting (jadwal, channel, pilar, PIC, caption, approval). Hasil = performa setelah tayang (tanggal aktual, reach, like, comment, saved, followers → engagement rate). Setiap rencana baru, perubahan, dan approval dikirim sebagai notifikasi & email ke tim." />
      <div className="tabs">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className="tab" data-on={tab === t.key}>
            <t.icon size={15} /> {t.label}
          </button>
        ))}
      </div>
      {tab === "calendar" && <Calendar />}
      {tab === "plan" && <Planning />}
      <Suspense fallback={null}>
        <LinkOpener
          onOpen={(id) => {
            setTab("results");
            setOpenId(id);
          }}
        />
      </Suspense>
      {tab === "results" && <Results openId={openId} onOpened={() => setOpenId(null)} />}
      {tab === "analytics" && <ContentAnalytics />}
    </div>
  );
}

const PLAN_COLUMNS = ["post_date", "post_time", "title", "brand", "channel", "content_type", "pillar", "pic", "status", "approval_status"];
const RESULT_COLUMNS = ["post_date", "title", "channel", "status", "post_link", "actual_date", "reach", "views", "likes", "comments", "saves", "followers"];

function usePlanStats(tick: number) {
  const f = useFilter();
  return useFetch<{ rows: Row[] }>(`/api/r/content?from=${f.from}&to=${f.to}${f.brand ? `&brand=${encodeURIComponent(f.brand)}` : ""}&_=${tick}`);
}

function Planning() {
  const toast = useToast();
  const [tick, setTick] = useState(0);
  const { data } = usePlanStats(tick);
  const rows = (data?.rows ?? []).filter((r) => r.status !== "Cancel");
  const today = todayISO();
  const count = (fn: (r: Row) => boolean) => rows.filter(fn).length;
  const approve = async (ids: number[], approval: string, done: () => void) => {
    try {
      await api("/api/r/content/bulk", "POST", { ids, data: { approval_status: approval } });
      toast(`${ids.length} konten → ${approval}`);
      done();
      setTick((t) => t + 1);
    } catch (e) {
      toast((e as Error).message, "err");
    }
  };
  return (
    <div className="space-y-5">
      <div className="stat-grid">
        <Kpi label="Rencana di periode" value={rows.length} format="number" />
        <Kpi label="7 hari ke depan" value={count((r) => String(r.post_date) >= today && String(r.post_date) <= addDays(today, 6))} format="number" />
        <Kpi label="Menunggu review" value={count((r) => r.approval_status === "Menunggu review")} format="number" />
        <Kpi label="Perlu revisi" value={count((r) => r.approval_status === "Perlu revisi")} format="number" />
        <Kpi label="Disetujui" value={count((r) => r.approval_status === "Disetujui")} format="number" />
        <Kpi label="Terlewat jadwal" value={count((r) => String(r.post_date) < today && r.status !== "Posted")} format="number" />
      </div>
      <ResourceTable
        resourceKey="content"
        columns={PLAN_COLUMNS}
        formGroups={["Rencana", "Approval"]}
        formTitle="Rencana konten"
        quickFilters={["status", "approval_status", "channel"]}
        computedCols={[]}
        searchPlaceholder="Cari judul, PIC, caption…"
        defaults={{ status: "Ide", approval_status: "Menunggu review" }}
        reloadKey={tick}
        onChanged={() => setTick((t) => t + 1)}
        selectionActions={(ids, done) => (
          <>
            <button className="btn btn-sm" onClick={() => approve(ids, "Disetujui", done)}>
              <Check size={13} /> Setujui
            </button>
            <button className="btn btn-sm" onClick={() => approve(ids, "Perlu revisi", done)}>
              <RotateCcw size={13} /> Minta revisi
            </button>
          </>
        )}
      />
    </div>
  );
}

function Results({ openId, onOpened }: { openId?: number | null; onOpened?: () => void }) {
  const toast = useToast();
  const [tick, setTick] = useState(0);
  const { data } = usePlanStats(tick);
  const today = todayISO();
  const due = (data?.rows ?? []).filter((r) => r.status !== "Cancel" && (r.status === "Posted" || String(r.post_date) <= today));
  const posted = due.filter((r) => r.status === "Posted");
  const filled = posted.filter((r) => Number(r.likes) || Number(r.reach) || Number(r.views));
  const ers = filled.filter((r) => Number(r.followers)).map((r) => (Number(r.likes ?? 0) + Number(r.comments ?? 0) + Number(r.saves ?? 0)) / Number(r.followers));
  return (
    <div className="space-y-5">
      <div className="stat-grid">
        <Kpi label="Sudah jatuh tempo" value={due.length} format="number" />
        <Kpi label="Sudah tayang" value={posted.length} format="number" hint={due.length ? `${Math.round((posted.length / due.length) * 100)}% dari jadwal` : ""} />
        <Kpi label="Hasil lengkap" value={filled.length} format="number" />
        <Kpi label="Hasil belum diisi" value={posted.length - filled.length} format="number" />
        <Kpi label="Rata-rata ER" value={ers.length ? ers.reduce((a, b) => a + b, 0) / ers.length : null} format="percent" />
      </div>
      <p className="text-[13px] text-[var(--ink-2)]">
        Hanya konten yang tanggalnya sudah lewat atau sudah tayang. Klik baris untuk mengisi hasil — rencananya tidak ikut berubah. Tandai status <b>Posted</b> agar masuk perhitungan.
      </p>
      <ResourceTable
        resourceKey="content"
        columns={RESULT_COLUMNS}
        formGroups={["Hasil"]}
        formTitle="Input hasil konten"
        openRowId={openId}
        onOpened={onOpened}
        allowCreate={false}
        quickFilters={["channel", "status"]}
        computedCols={["result_state", "er", "on_time"]}
        selectionActions={(ids, done) => (
          <button
            className="btn btn-sm btn-primary"
            onClick={async () => {
              try {
                const r = await api<{ updated: number; failed: { title: string; message: string }[] }>("/api/content/metrics", "POST", { ids });
                toast(`${r.updated} konten diperbarui${r.failed.length ? ` · ${r.failed.length} gagal: ${r.failed[0].message}` : ""}`, r.failed.length && !r.updated ? "err" : "ok");
                done();
                setTick((t) => t + 1);
              } catch (e) {
                toast((e as Error).message, "err");
              }
            }}
          >
            <Link2 size={13} /> Tarik metrik dari link
          </button>
        )}
        rowFilter={(r) => r.status !== "Cancel" && (r.status === "Posted" || String(r.post_date) <= today)}
        reloadKey={tick}
        onChanged={() => setTick((t) => t + 1)}
      />
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
  const [detail, setDetail] = useState<Row | null>(null);
  const [dropOn, setDropOn] = useState<number | null>(null);
  const toast = useToast();
  const [tick, setTick] = useState(0);
  const filesQ = useFetch<{ enabled: boolean; files: (DriveFileLite & { record_id: number })[] }>(`/api/drive/by-record?resource=content&from=${from}&to=${to}&_=${tick}`);
  const filesOf = (id: unknown) => (filesQ.data?.files ?? []).filter((x) => x.record_id === Number(id));
  const dropFile = async (c: Row, list: FileList) => {
    for (const file of Array.from(list)) {
      try {
        const r = await uploadToDrive("content", Number(c.id), file);
        toast(`${r.name} tersimpan di Drive`);
      } catch (e) {
        toast((e as Error).message, "err");
      }
    }
    setTick((t) => t + 1);
    content.reload();
  };

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
                    <button
                      key={c.id}
                      onClick={() => setDetail(c)}
                      onDragOver={(e) => {
                        if (filesQ.data?.enabled) {
                          e.preventDefault();
                          setDropOn(Number(c.id));
                        }
                      }}
                      onDragLeave={() => setDropOn(null)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setDropOn(null);
                        if (e.dataTransfer.files?.length) dropFile(c, e.dataTransfer.files);
                      }}
                      className={`mb-1 block w-full overflow-hidden rounded border bg-white text-left text-[11.5px] hover:border-[var(--accent)] ${dropOn === Number(c.id) ? "border-[var(--accent)] ring-2 ring-[var(--accent-soft)]" : "border-[var(--line)]"}`}
                      title={`${c.title} · ${c.channel ?? ""} · ${c.status ?? ""}${filesQ.data?.enabled ? " — seret file ke sini untuk upload" : ""}`}
                    >
                      {(() => {
                        const fs = filesOf(c.id);
                        const img = fs.find((x) => isImage(x.mime, x.name));
                        return img ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={thumbUrl(img.drive_id, 320)} alt="" className="h-14 w-full object-cover" loading="lazy" referrerPolicy="no-referrer" onError={(e) => (e.currentTarget.style.display = "none")} />
                        ) : null;
                      })()}
                      <span className="flex items-center gap-1.5 px-1.5 py-0.5">
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: STATUS_DOT[String(c.status)] ?? "#d6d2c4" }} />
                        <span className="truncate">{String(c.title)}</span>
                        {filesOf(c.id).length > 0 && <Paperclip size={10} className="ml-auto shrink-0 text-[var(--muted)]" />}
                      </span>
                    </button>
                  ))}
                </>
              )}
            </div>
          ))}
        </div>
      </div>
      {detail && (
        <ContentDrawer
          row={detail}
          onClose={() => setDetail(null)}
          onEdit={() => {
            setEditing({ row: detail });
            setDetail(null);
          }}
          onChanged={() => {
            content.reload();
            setTick((t) => t + 1);
          }}
        />
      )}
      {editing && (
        <ResourceForm resource={RESOURCE_MAP.content} row={editing.row} defaults={{ post_date: editing.date, status: "Ide", approval_status: "Menunggu review", brand: f.brand || undefined }} onClose={() => setEditing(null)} onSaved={content.reload} />
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
      <div className="stat-grid">
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
