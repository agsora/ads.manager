"use client";

import { Bar, BarChart, CartesianGrid, Cell, LabelList, Pie, PieChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";
import { fmtNum } from "@/lib/format";
import { ratingColor } from "./branch-map";

const AXIS = { fontSize: 11.5, fill: "#8a8880" };
const GRID = "#eeebe3";
const r1 = (v: number) => fmtNum(v, 1);
export const TARGET = 4.5;

/** Colour of each star band, from green (5★) to red (1★). */
export const BAND_COLORS: Record<string, string> = { "5": "#2f9e5b", "4": "#9bb83a", "3": "#e0a21a", "2": "#e07a2a", "1": "#cf4b3a", none: "#cfcbbd" };

function Tip({ rows, title }: { rows: [string, string][]; title: string }) {
  return (
    <div className="rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-[12.5px] shadow-lg">
      <div className="mb-1 font-semibold">{title}</div>
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-4">
          <span className="text-[var(--muted)]">{k}</span>
          <span className="tnum font-medium">{v}</span>
        </div>
      ))}
    </div>
  );
}

/** Donut: how many branches sit in each star band; the middle shows the combined rating. */
export function StarDonut({ data, centerTop, centerBottom }: { data: { key: string; name: string; value: number }[]; centerTop: string; centerBottom: string }) {
  const shown = data.filter((d) => d.value > 0);
  return (
    <div className="relative mx-auto h-[210px] w-full max-w-[260px]">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={shown} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="94%" paddingAngle={shown.length > 1 ? 2 : 0} stroke="none" startAngle={90} endAngle={-270}>
            {shown.map((d) => (
              <Cell key={d.key} fill={BAND_COLORS[d.key]} />
            ))}
          </Pie>
          <Tooltip content={({ payload }) => (payload?.[0] ? <Tip title={String(payload[0].name)} rows={[["Cabang", String(payload[0].value)]]} /> : null)} />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
        <div>
          <div className="serif text-[30px] leading-none">{centerTop}</div>
          <div className="mt-1 text-[11.5px] text-[var(--muted)]">{centerBottom}</div>
        </div>
      </div>
    </div>
  );
}

/** Every branch as a bar, best to worst, with the 4.5 target marked. */
export function BranchRatingBars({ data }: { data: { name: string; rating: number; reviews: number }[] }) {
  const h = Math.max(240, data.length * 27 + 56);
  return (
    <div style={{ height: h }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 4, right: 38, top: 22, bottom: 0 }} barCategoryGap={5}>
          <CartesianGrid horizontal={false} stroke={GRID} />
          <XAxis type="number" domain={[0, 5]} ticks={[0, 1, 2, 3, 4, 5]} tick={AXIS} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="name" width={118} tick={{ ...AXIS, fill: "#3a3a36" }} axisLine={false} tickLine={false} interval={0} />
          <Tooltip cursor={{ fill: "rgba(31,30,29,0.04)" }} content={({ payload }) => (payload?.[0] ? <Tip title={payload[0].payload.name} rows={[["Rating", `${r1(payload[0].payload.rating)}★`], ["Ulasan", fmtNum(payload[0].payload.reviews)]]} /> : null)} />
          <ReferenceLine x={TARGET} stroke="#2f9e5b" strokeDasharray="4 3" label={{ value: "Target 4,5", position: "top", fontSize: 11, fill: "#2f9e5b" }} />
          <Bar dataKey="rating" radius={[0, 5, 5, 0]} maxBarSize={18}>
            {data.map((d) => (
              <Cell key={d.name} fill={ratingColor(d.rating)} />
            ))}
            <LabelList dataKey="rating" position="right" formatter={(v: unknown) => r1(Number(v))} style={{ fontSize: 12, fontWeight: 600, fill: "#3a3a36" }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Bubble map of impact: right = many reviews, down = low rating. Bottom right (red zone) is where to act first. */
export function ImpactScatter({ data }: { data: { name: string; rating: number; reviews: number }[] }) {
  const maxR = Math.max(10, ...data.map((d) => d.reviews));
  const sorted = [...data].map((d) => d.reviews).sort((a, b) => a - b);
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
  const minRating = Math.max(0, Math.floor(Math.min(...data.map((d) => d.rating), 4) * 2) / 2 - 0.5);
  return (
    <div className="h-[340px]">
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ left: 0, right: 16, top: 12, bottom: 18 }}>
          <CartesianGrid stroke={GRID} />
          <XAxis type="number" dataKey="reviews" domain={[0, Math.ceil(maxR * 1.1)]} tick={AXIS} axisLine={false} tickLine={false} label={{ value: "Jumlah ulasan", position: "insideBottom", offset: -10, fontSize: 11.5, fill: "#8a8880" }} />
          <YAxis type="number" dataKey="rating" domain={[minRating, 5]} tick={AXIS} axisLine={false} tickLine={false} width={32} tickFormatter={(v) => fmtNum(v, 1)} />
          <ZAxis type="number" dataKey="reviews" range={[110, 110]} />
          <ReferenceArea x1={median} x2={Math.ceil(maxR * 1.1)} y1={minRating} y2={TARGET} fill="#cf4b3a" fillOpacity={0.07} />
          <ReferenceLine y={TARGET} stroke="#2f9e5b" strokeDasharray="4 3" />
          <Tooltip cursor={{ strokeDasharray: "3 3" }} content={({ payload }) => (payload?.[0] ? <Tip title={payload[0].payload.name} rows={[["Rating", `${r1(payload[0].payload.rating)}★`], ["Ulasan", fmtNum(payload[0].payload.reviews)]]} /> : null)} />
          <Scatter data={data} isAnimationActive={false}>
            {data.map((d) => (
              <Cell key={d.name} fill={ratingColor(d.rating)} stroke="#fff" strokeWidth={2} />
            ))}
            <LabelList dataKey="name" position="top" style={{ fontSize: 10.5, fill: "#3a3a36" }} />
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}

/** One column per region, coloured by rating, with the target line. */
export function RegionColumns({ data }: { data: { name: string; rating: number; branches: number; reviews: number; low?: string; high?: string }[] }) {
  return (
    <div className="h-[280px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ left: 0, right: 8, top: 22, bottom: 0 }} barCategoryGap="22%">
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey="name" tick={{ ...AXIS, fill: "#3a3a36" }} axisLine={false} tickLine={false} interval={0} />
          <YAxis domain={[0, 5]} ticks={[0, 1, 2, 3, 4, 5]} tick={AXIS} axisLine={false} tickLine={false} width={28} />
          <Tooltip
            cursor={{ fill: "rgba(31,30,29,0.04)" }}
            content={({ payload }) => {
              const d = payload?.[0]?.payload;
              return d ? <Tip title={d.name} rows={[["Rating", `${r1(d.rating)}★`], ["Cabang", String(d.branches)], ["Ulasan", fmtNum(d.reviews)], ...(d.low ? ([["Terendah", d.low]] as [string, string][]) : []), ...(d.high ? ([["Tertinggi", d.high]] as [string, string][]) : [])]} /> : null;
            }}
          />
          <ReferenceLine y={TARGET} stroke="#2f9e5b" strokeDasharray="4 3" />
          <Bar dataKey="rating" radius={[6, 6, 0, 0]} maxBarSize={56}>
            {data.map((d) => (
              <Cell key={d.name} fill={ratingColor(d.rating)} />
            ))}
            <LabelList dataKey="rating" position="top" formatter={(v: unknown) => `${r1(Number(v))}★`} style={{ fontSize: 12, fontWeight: 600, fill: "#3a3a36" }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Diverging bars: how each branch's rating moved since the start of the period. */
export function ChangeBars({ data }: { data: { name: string; change: number }[] }) {
  const h = Math.max(160, data.length * 28 + 30);
  const m = Math.max(0.3, ...data.map((d) => Math.abs(d.change)));
  return (
    <div style={{ height: h }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 4, right: 36, top: 4, bottom: 0 }} barCategoryGap={6}>
          <CartesianGrid horizontal={false} stroke={GRID} />
          <XAxis type="number" domain={[-m, m]} tick={AXIS} axisLine={false} tickLine={false} tickFormatter={(v) => fmtNum(v, 1)} />
          <YAxis type="category" dataKey="name" width={118} tick={{ ...AXIS, fill: "#3a3a36" }} axisLine={false} tickLine={false} interval={0} />
          <ReferenceLine x={0} stroke="#b9b6a9" />
          <Tooltip cursor={{ fill: "rgba(31,30,29,0.04)" }} content={({ payload }) => (payload?.[0] ? <Tip title={payload[0].payload.name} rows={[["Perubahan", `${payload[0].payload.change > 0 ? "+" : ""}${r1(payload[0].payload.change)}★`]]} /> : null)} />
          <Bar dataKey="change" radius={3} maxBarSize={16}>
            {data.map((d) => (
              <Cell key={d.name} fill={d.change >= 0 ? "#2f9e5b" : "#cf4b3a"} />
            ))}
            <LabelList dataKey="change" position="right" formatter={(v: unknown) => `${Number(v) > 0 ? "+" : ""}${r1(Number(v))}`} style={{ fontSize: 11.5, fontWeight: 600, fill: "#3a3a36" }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
