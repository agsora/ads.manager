"use client";

import { PageHeader } from "@/components/shell";
import { ResourceTable } from "@/components/resource-table";
import { monthStart, todayISO } from "@/lib/format";
import { useFetch, useFilter } from "@/components/providers";
import { Card } from "@/components/charts";
import { useState } from "react";
import type { ContentKpiProgress } from "@/lib/kpi-content";

export default function KpiPage() {
  const f = useFilter();
  const [tick, setTick] = useState(0);
  const { data, error, loading, reload } = useFetch<{ rows: ContentKpiProgress }>(`/api/kpi/progress?brand=${encodeURIComponent(f.brand || "")}&_=${tick}`);
  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Konten" title="Target KPI Bulanan" desc="Atur target per bulan dan brand. Untuk target konten, pilih kategori, jenis konten, serta cabang; kosong berarti semua. Pilihan dropdown dikelola di Pengaturan → Daftar Pilihan." />
      <ResourceTable resourceKey="kpi" ignoreDate defaults={{ period: monthStart(todayISO()) }} quickFilters={["content_category", "content_type", "branch"]} onChanged={() => setTick((t) => t + 1)} />
      <Card title="Progres Target Konten" subtitle="Diunggah: satu konten dengan file lampiran, dihitung pada bulan unggahan pertama. Tayang: status Posted, berdasarkan tanggal aktual atau tanggal posting. Konten Cancel tidak dihitung." action={<button className="btn btn-sm" onClick={reload}>Perbarui</button>}>
        {error ? <p role="alert">{error}</p> : loading ? <p>Memuat progres…</p> : !data?.rows.length ? <p className="text-sm text-[var(--muted)]">Isi Target Konten Diunggah atau Target Jumlah Posting untuk melihat progres otomatis.</p> : (
          <div className="grid gap-3 md:grid-cols-2">
            {data.rows.map((r) => (
              <div key={r.id} className="rounded-lg border border-[var(--grid)] p-3">
                <h3 className="font-semibold">{r.title}</h3>
                <p className="mb-3 text-xs text-[var(--muted)]">{[r.month, r.brand, r.category || "Semua kategori", r.contentType || "Semua jenis", r.branch || "Semua cabang"].filter(Boolean).join(" · ")}</p>
                {[{ label: "Diunggah", actual: r.uploaded, target: r.targetUploads }, { label: "Tayang", actual: r.posted, target: r.targetPosts }].filter((x) => x.target > 0).map((x) => (
                  <div key={x.label} className="mt-2">
                    <div className="flex justify-between text-sm"><span>{x.label}</span><span>{x.actual} / {x.target} · {Math.round(x.actual / x.target * 100)}%</span></div>
                    <progress className="mt-1 h-2 w-full accent-[var(--accent)]" value={Math.min(x.actual, x.target)} max={x.target} aria-label={`${x.label}: ${r.title}`} />
                    <p className="text-xs text-[var(--muted)]">{x.actual >= x.target ? "Target tercapai" : `Kurang ${x.target - x.actual} konten`}</p>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
