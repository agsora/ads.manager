"use client";

import { useMemo, useState } from "react";
import { PageHeader } from "@/components/shell";
import { ResourceTable } from "@/components/resource-table";
import { useFetch } from "@/components/providers";
import { Card, Empty } from "@/components/charts";
import { fmtMoney, fmtPct } from "@/lib/format";
import { n, type Row } from "@/lib/resources";

export default function CreativesPage() {
  const [tick, setTick] = useState(0);
  const { data } = useFetch<{ rows: Row[] }>(`/api/r/creatives?t=${tick}`);

  // rank creatives that have enough data: lowest cost per lead first
  const ranked = useMemo(() => {
    const rows = (data?.rows ?? []).map((r) => ({
      id: r.id,
      name: String(r.name ?? ""),
      brand: String(r.brand ?? ""),
      format: String(r.format ?? ""),
      spend: n(r.spend),
      leads: n(r.leads),
      ctr: n(r.impressions) ? n(r.clicks) / n(r.impressions) : null,
      cpl: n(r.leads) ? n(r.spend) / n(r.leads) : null,
      verdict: String(r.verdict ?? ""),
    }));
    return rows.filter((r) => r.cpl !== null && r.leads >= 3).sort((a, b) => (a.cpl ?? 0) - (b.cpl ?? 0));
  }, [data]);
  const best = ranked.slice(0, 3);
  const worst = ranked.slice(3).slice(-2).reverse(); // never repeat a creative already listed as best

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Iklan"
        title="Library Kreatif"
        desc="Simpan setiap desain/video iklan beserta hasilnya. Dari sini terlihat kreatif mana yang murah mendapat leads (layak diulang) dan mana yang boros (layak dihentikan)."
      />
      {ranked.length > 0 && (
        <div className="grid gap-5 md:grid-cols-2">
          <Card title="Kreatif terbaik" subtitle="Biaya per lead paling rendah (min. 3 leads)">
            <ol className="space-y-2.5">
              {best.map((r, i) => (
                <Item key={r.id} i={i + 1} r={r} />
              ))}
            </ol>
          </Card>
          <Card title="Perlu dievaluasi" subtitle="Biaya per lead paling tinggi">
            {worst.length ? (
              <ol className="space-y-2.5">
                {worst.map((r, i) => (
                  <Item key={r.id} i={i + 1} r={r} bad />
                ))}
              </ol>
            ) : (
              <Empty text="Butuh lebih banyak data kreatif untuk dibandingkan" />
            )}
          </Card>
        </div>
      )}
      <ResourceTable resourceKey="creatives" ignoreDate quickFilters={["format", "verdict"]} onChanged={() => setTick((t) => t + 1)} searchPlaceholder="Cari nama kreatif, campaign…" />
    </div>
  );
}

function Item({ i, r, bad }: { i: number; r: { name: string; brand: string; format: string; spend: number; leads: number; ctr: number | null; cpl: number | null; verdict: string }; bad?: boolean }) {
  return (
    <li className="flex items-center gap-3">
      <span className={`serif grid h-7 w-7 shrink-0 place-items-center rounded-full text-[14px] ${bad ? "bg-[#fbefec] text-[var(--critical-ink)]" : "bg-[var(--accent-soft)] text-[var(--accent-ink)]"}`}>{i}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-medium">{r.name}</span>
        <span className="block truncate text-[12px] text-[var(--muted)]">
          {[r.brand, r.format, r.verdict].filter(Boolean).join(" · ")} · CTR {fmtPct(r.ctr)}
        </span>
      </span>
      <span className="text-right">
        <span className="block text-[14px] font-semibold tnum">{fmtMoney(r.cpl)}</span>
        <span className="block text-[11.5px] text-[var(--muted)]">per lead</span>
      </span>
    </li>
  );
}
