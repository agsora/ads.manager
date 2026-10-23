"use client";

import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, CheckCircle2, Info, OctagonAlert } from "lucide-react";
import { fmtCompact, fmtDate, fmtMoney, fmtNum, fmtPct, formatValue } from "@/lib/format";
import type { Insight } from "@/lib/analytics";

export const SERIES = ["var(--s1)", "var(--s2)", "var(--s3)", "var(--s4)", "var(--s5)", "var(--s6)", "var(--s7)", "var(--s8)"];
export const SEGMENT_COLORS: Record<string, string> = { HOT: "var(--s1)", WARM: "var(--s4)", COLD: "var(--s2)" };
const AXIS = { fontSize: 11.5, fill: "#8a8880" };
const GRID = "#eeebe3";

export function Card({ title, subtitle, action, children, className = "" }: { title?: string; subtitle?: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`card min-w-0 p-5 ${className}`}>
      {(title || action) && (
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            {title && <h3 className="serif text-[18px] font-medium leading-snug">{title}</h3>}
            {subtitle && <p className="mt-0.5 text-[12.5px] text-[var(--muted)]">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

/** Tiny trend line for a KPI tile (no axes; the tile's number is the value). */
export function Sparkline({ data, color = "var(--s1)", width = 84, height = 28 }: { data: number[]; color?: string; width?: number; height?: number }) {
  if (data.length < 2 || data.every((v) => !v)) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const span = max - min || 1;
  const pts = data.map((v, i) => [(i / (data.length - 1)) * width, height - 2 - ((v - min) / span) * (height - 4)]);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const id = `sg${Math.round(Math.random() * 1e9)}`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="shrink-0 overflow-visible" aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity=".18" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L${width},${height} L0,${height} Z`} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="2.2" fill={color} />
    </svg>
  );
}

export function Kpi({ label, value, prev, format, invert, hint, spark }: { label: string; value: number | null | undefined; prev?: number | null; format: string; invert?: boolean; hint?: string; spark?: number[] }) {
  const delta = prev && value !== null && value !== undefined && Number.isFinite(prev) && prev !== 0 ? value / prev - 1 : null;
  const good = delta !== null && (invert ? delta < 0 : delta > 0);
  return (
    <div className="px-4 py-4">
      <div className="text-[12.5px] text-[var(--ink-2)]">{label}</div>
      <div className="mt-1 flex items-end justify-between gap-2">
        <div className="serif whitespace-nowrap text-[26px] leading-tight tracking-[-0.01em]">{value === null || value === undefined ? "–" : format === "money" ? fmtMoneyCompact(value) : formatValue(value, format)}</div>
        {spark && (
          <div className="mb-1.5 hidden opacity-90 min-[420px]:block">
            <Sparkline data={spark} width={64} height={24} />
          </div>
        )}
      </div>
      <div className="mt-1.5 flex items-center gap-1.5 text-[12px]">
        {delta !== null ? (
          <span className={`inline-flex items-center gap-0.5 font-semibold ${Math.abs(delta) < 0.005 ? "text-[var(--muted)]" : good ? "text-[var(--good-ink)]" : "text-[var(--critical-ink)]"}`}>
            {delta >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
            {fmtPct(Math.abs(delta), 0)}
          </span>
        ) : null}
        <span className="text-[var(--muted)]">{hint ?? (delta !== null ? "vs periode lalu" : "")}</span>
      </div>
    </div>
  );
}

function fmtMoneyCompact(v: number | null | undefined) {
  if (v === null || v === undefined) return "–";
  if (Math.abs(v) >= 1e6) return (v < 0 ? "-" : "") + "Rp " + Math.abs(v / 1e6).toLocaleString("id-ID", { maximumFractionDigits: 2 }) + " jt";
  return fmtMoney(v);
}

function TipBox({ active, payload, label, fmt }: { active?: boolean; payload?: { name: string; value: number; color: string; dataKey: string }[]; label?: string; fmt: (k: string, v: number) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-[12.5px] shadow-lg">
      <div className="mb-1 font-semibold">{/^\d{4}-\d{2}-\d{2}$/.test(String(label)) ? fmtDate(label) : label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: p.color }} />
          <span className="text-[var(--ink-2)]">{p.name}</span>
          <span className="ml-auto pl-3 font-semibold tnum">{fmt(p.dataKey, p.value)}</span>
        </div>
      ))}
    </div>
  );
}

const shortDate = (d: string) => (/^\d{4}-\d{2}-\d{2}$/.test(d) ? `${+d.slice(8)}/${+d.slice(5, 7)}` : d);

export function TrendLines({ data, series, format = "number", height = 240, area, decimals }: { data: Record<string, unknown>[]; series: { key: string; label: string }[]; format?: string; height?: number; area?: boolean; /** tight y-axis with decimals (ratings) */ decimals?: boolean }) {
  const dots = data.length <= 14;
  const fmt = (_k: string, v: number) => (format === "money" ? fmtMoney(v) : fmtNum(v, 1));
  const Chart = area ? AreaChart : LineChart;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <Chart data={data} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="date" tickFormatter={shortDate} tick={AXIS} tickLine={false} axisLine={{ stroke: "#d6d2c4" }} minTickGap={18} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} width={format === "money" ? 56 : 36} tickFormatter={(v) => (format === "money" ? fmtCompact(v) : fmtCompact(v))} allowDecimals={!!decimals} domain={decimals ? [(m: number) => Math.floor(m * 10 - 2) / 10, (m: number) => Math.ceil(m * 10 + 2) / 10] : undefined} />
        <Tooltip content={<TipBox fmt={fmt} />} cursor={{ stroke: "#c3c2b7", strokeWidth: 1 }} />
        {series.length > 1 && <Legend iconType="square" iconSize={10} wrapperStyle={{ fontSize: 12 }} />}
        {series.map((s, i) =>
          area ? (
            <Area key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={SERIES[i]} fill={SERIES[i]} fillOpacity={0.12} strokeWidth={2} dot={dots ? { r: 3, strokeWidth: 0, fill: SERIES[i] } : false} activeDot={{ r: 4 }} />
          ) : (
            <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={SERIES[i]} strokeWidth={2} dot={dots ? { r: 3, strokeWidth: 0, fill: SERIES[i] } : false} activeDot={{ r: 4 }} />
          ),
        )}
      </Chart>
    </ResponsiveContainer>
  );
}

export function Bars({ data, series, format = "number", height = 240, xKey = "name", stacked }: { data: Record<string, unknown>[]; series: { key: string; label: string }[]; format?: string; height?: number; xKey?: string; stacked?: boolean }) {
  const fmt = (_k: string, v: number) => formatValue(v, format);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 6, right: 8, left: 0, bottom: 0 }} barGap={2}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey={xKey} tickFormatter={shortDate} tick={AXIS} tickLine={false} axisLine={{ stroke: "#d6d2c4" }} interval="preserveStartEnd" minTickGap={10} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} width={format === "money" ? 56 : 36} tickFormatter={(v) => (format === "percent" ? fmtPct(v, 0) : fmtCompact(v))} />
        <Tooltip content={<TipBox fmt={fmt} />} cursor={{ fill: "rgba(31,30,29,0.04)" }} />
        {series.length > 1 && <Legend iconType="square" iconSize={10} wrapperStyle={{ fontSize: 12 }} />}
        {series.map((s, i) => (
          <Bar key={s.key} dataKey={s.key} name={s.label} fill={SERIES[i]} radius={stacked ? 0 : [4, 4, 0, 0]} maxBarSize={36} stackId={stacked ? "a" : undefined} stroke="#fff" strokeWidth={stacked ? 1 : 0} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Horizontal labelled bars (HTML) — readable category ranking with values. */
export function BarList({ items, format = "number", color = "var(--s1)", sub }: { items: { name: string; value: number; sub?: string }[]; format?: string; color?: string; sub?: boolean }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  if (!items.length) return <Empty />;
  return (
    <div className="space-y-2.5">
      {items.map((it) => (
        <div key={it.name} title={`${it.name}: ${formatValue(it.value, format)}`}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-[13px]">
            <span className="truncate font-medium">{it.name || "(Kosong)"}</span>
            <span className="shrink-0 font-semibold tnum">
              {formatValue(it.value, format)}
              {sub && it.sub && <span className="ml-1.5 font-normal text-[var(--muted)]">{it.sub}</span>}
            </span>
          </div>
          <div className="h-2 rounded-full bg-[var(--track)]">
            <div className="h-2 rounded-full" style={{ width: `${(it.value / max) * 100}%`, background: color }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function Funnel({ steps }: { steps: { name: string; value: number }[] }) {
  const max = Math.max(1, ...steps.map((s) => s.value));
  // impressions dwarf every later step, so bar widths use a cube-root scale to keep small steps visible
  const width = (v: number) => (v > 0 ? Math.max(3, Math.cbrt(v / max) * 100) : 0);
  return (
    <div>
      <ol className="space-y-3.5">
        {steps.map((s, i) => {
          const prev = i > 0 ? steps[i - 1].value : null;
          const rate = prev ? s.value / prev : null;
          return (
            <li key={s.name} className="min-w-0">
              <div className="mb-1 flex items-baseline justify-between gap-3 text-[13px]">
                <span className="min-w-0 truncate font-medium text-[var(--ink-2)]">{s.name}</span>
                <span className="shrink-0 tnum">
                  <b className="text-[14px]">{fmtNum(s.value)}</b>
                  {rate !== null && <span className="ml-2 rounded-full bg-[var(--surface-2)] px-1.5 py-0.5 text-[11px] text-[var(--muted)]">{fmtPct(rate, 1)}<span className="hidden sm:inline"> dari tahap sebelumnya</span></span>}
                </span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-[var(--track)]">
                <div className="h-3 rounded-full" style={{ width: `${width(s.value)}%`, background: i < 3 ? "var(--s1)" : "var(--accent-ink)", transition: "width .6s cubic-bezier(.2,.8,.2,1)" }} />
              </div>
            </li>
          );
        })}
      </ol>
      <p className="mt-3 text-[11.5px] text-[var(--muted)]">Lebar batang diskalakan agar tahap kecil tetap terlihat; angka dan persentase adalah nilai sebenarnya.</p>
    </div>
  );
}

/** One stacked bar for a part-to-whole split (e.g. HOT/WARM/COLD) with legend. */
export function SplitBar({ parts, colors }: { parts: { name: string; value: number }[]; colors?: Record<string, string> }) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  if (!total) return <Empty />;
  return (
    <div>
      <div className="flex h-3.5 gap-[2px] overflow-hidden rounded-full">
        {parts.map((p, i) =>
          p.value ? <div key={p.name} title={`${p.name}: ${p.value}`} style={{ width: `${(p.value / total) * 100}%`, background: colors?.[p.name] ?? SERIES[i % 8] }} /> : null,
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[12.5px]">
        {parts.map((p, i) => (
          <span key={p.name} className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: colors?.[p.name] ?? SERIES[i % 8] }} />
            <span className="text-[var(--ink-2)]">{p.name || "(Kosong)"}</span>
            <b className="tnum">{p.value}</b>
            <span className="text-[var(--muted)] tnum">{fmtPct(p.value / total, 0)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

export function Empty({ text = "Belum ada data" }: { text?: string }) {
  return <div className="grid h-24 place-items-center rounded-lg border border-dashed border-[var(--line)] text-[13px] text-[var(--muted)]">{text}</div>;
}

const LEVEL_META: Record<Insight["level"], { label: string; icon: React.ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>; color: string; bg: string }> = {
  critical: { label: "Kritis", icon: OctagonAlert, color: "var(--critical-ink)", bg: "#fff" },
  warning: { label: "Perlu perhatian", icon: AlertTriangle, color: "var(--warning-ink)", bg: "#fff" },
  info: { label: "Saran", icon: Info, color: "var(--ink-2)", bg: "#fff" },
  good: { label: "Bagus", icon: CheckCircle2, color: "var(--good-ink)", bg: "#fff" },
};

export function InsightItem({ i, compact }: { i: Insight; compact?: boolean }) {
  const m = LEVEL_META[i.level];
  const Icon = m.icon;
  return (
    <div className="rounded-xl border border-[var(--line)] p-3.5" style={{ background: m.bg }}>
      <div className="flex items-start gap-3">
        <Icon size={17} className="mt-0.5 shrink-0" style={{ color: m.color }} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: m.color }}>
              {m.label}
            </span>
            <span className="text-[11px] text-[var(--muted)]">· {i.area}</span>
          </div>
          <div className="mt-1 text-[14.5px] font-semibold leading-snug">{i.title}</div>
          {!compact && <div className="mt-1 text-[13px] text-[var(--ink-2)]">{i.detail}</div>}
          <div className="mt-2 rounded-md bg-[var(--surface-2)] px-2.5 py-1.5 text-[13px] leading-relaxed">
            <span className="font-semibold text-[var(--accent-ink)]">Lakukan: </span>
            {i.action}
          </div>
        </div>
      </div>
    </div>
  );
}

export const scoreTone = (v: number | null) => (v === null ? "#d6d2c4" : v >= 70 ? "var(--good)" : v >= 45 ? "var(--warning)" : "var(--critical)");
export const scoreWord = (v: number | null) => (v === null ? "Belum ada data" : v >= 70 ? "Sehat" : v >= 45 ? "Cukup" : "Perlu perbaikan");

/** Large score ring for the dashboard hero. */
export function ScoreRing({ value, size = 108 }: { value: number | null; size?: number }) {
  const tone = scoreTone(value);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 36 36" className="-rotate-90" style={{ width: size, height: size }} aria-hidden>
        <circle cx="18" cy="18" r="15.5" fill="none" stroke="#eeebe3" strokeWidth="2.6" />
        <circle cx="18" cy="18" r="15.5" fill="none" stroke={tone} strokeWidth="2.6" strokeDasharray={`${((value ?? 0) / 100) * 97.4} 97.4`} strokeLinecap="round" style={{ transition: "stroke-dasharray .8s cubic-bezier(.2,.8,.2,1)" }} />
      </svg>
      <span className="absolute inset-0 grid place-items-center">
        <span className="text-center">
          <span className="serif block text-[34px] leading-none tnum">{value ?? "–"}</span>
          <span className="mt-1 block text-[10.5px] uppercase tracking-[.08em] text-[var(--muted)]">dari 100</span>
        </span>
      </span>
    </div>
  );
}

/** Skeleton for a row of KPI tiles while analytics load. */
export function KpiSkeleton({ n = 8 }: { n?: number }) {
  return (
    <div className="stat-grid">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="px-4 py-4">
          <div className="skel h-3 w-24" />
          <div className="skel mt-3 h-7 w-28" />
          <div className="skel mt-3 h-3 w-20" />
        </div>
      ))}
    </div>
  );
}

export function PageSkeleton({ kpis = 8, cards = 2 }: { kpis?: number; cards?: number }) {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Memuat">
      <div>
        <div className="skel h-3 w-24" />
        <div className="skel mt-3 h-9 w-72" />
        <div className="skel mt-3 h-4 w-[min(520px,90%)]" />
      </div>
      <KpiSkeleton n={kpis} />
      <div className="grid gap-5 lg:grid-cols-2">
        {Array.from({ length: cards }).map((_, i) => (
          <div key={i} className="card p-5">
            <div className="skel h-5 w-40" />
            <div className="skel mt-5 h-40 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function Score({ label, value }: { label: string; value: number | null }) {
  const tone = value === null ? "#d6d2c4" : value >= 70 ? "var(--good)" : value >= 45 ? "var(--warning)" : "var(--critical)";
  const word = value === null ? "Belum ada data" : value >= 70 ? "Sehat" : value >= 45 ? "Cukup" : "Perlu perbaikan";
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className="relative h-12 w-12 shrink-0">
        <svg viewBox="0 0 36 36" className="h-12 w-12 -rotate-90">
          <circle cx="18" cy="18" r="15.5" fill="none" stroke="#eeebe3" strokeWidth="3.5" />
          <circle cx="18" cy="18" r="15.5" fill="none" stroke={tone} strokeWidth="3.5" strokeDasharray={`${((value ?? 0) / 100) * 97.4} 97.4`} strokeLinecap="round" />
        </svg>
        <span className="serif absolute inset-0 grid place-items-center text-[16px] tnum">{value ?? "–"}</span>
      </div>
      <div className="min-w-0">
        <div className="truncate text-[13px] font-semibold">{label}</div>
        <div className="truncate text-[12px] text-[var(--muted)]">{word}</div>
      </div>
    </div>
  );
}

export function MiniTable({ cols, rows, empty }: { cols: { key: string; label: string; format?: string; align?: "right" }[]; rows: Record<string, unknown>[]; empty?: string }) {
  if (!rows.length) return <Empty text={empty} />;
  return (
    <div className="-mx-5 overflow-x-auto">
      <table className="data">
        <thead>
          <tr>
            {cols.map((c) => (
              <th key={c.key} className={c.align === "right" || (c.format && c.format !== "text" && c.format !== "date") ? "num" : ""}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {cols.map((c) => (
                <td key={c.key} className={c.align === "right" || (c.format && c.format !== "text" && c.format !== "date") ? "num" : c.format === "date" ? "whitespace-nowrap" : ""}>
                  {c.format ? formatValue(r[c.key], c.format) : String(r[c.key] ?? "–")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
