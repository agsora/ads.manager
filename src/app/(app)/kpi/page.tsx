"use client";

import { PageHeader } from "@/components/shell";
import { api, useFetch, useFilter, useMeta, useToast } from "@/components/providers";
import { Card } from "@/components/charts";
import { useState } from "react";
import { KpiBoard } from "@/components/kpi-board";
import { KpiForm } from "@/components/kpi-form";
import { ImportDialog } from "@/components/import-dialog";
import type { KpiScorecard } from "@/lib/kpi-engine";
import type { Row } from "@/lib/resources";

export default function KpiPage() {
  const f = useFilter();
  const { session } = useMeta();
  const toast = useToast();
  const [editing, setEditing] = useState<Row | null | undefined>(undefined);
  const [importing, setImporting] = useState(false);
  const { data, error, loading, reload } = useFetch<{ scorecards: KpiScorecard[] }>(`/api/kpi/progress?brand=${encodeURIComponent(f.brand || "")}`);
  const remove = async (row: Row) => {
    if (!confirm(`Hapus KPI "${row.title || row.brand}"?`)) return;
    try { await api(`/api/r/kpi/${row.id}`, "DELETE"); toast("KPI dihapus"); reload(); }
    catch (e) { toast((e as Error).message, "err"); }
  };
  const review = async (row: Row, action: "lock" | "unlock") => {
    if (!confirm(action === "lock" ? "Kunci evaluasi? Hasil bulan ini akan disimpan dan target tidak dapat diedit sebelum dibuka kembali oleh admin." : "Buka evaluasi? Hasil akan kembali dihitung dari data terbaru.")) return;
    try { await api(`/api/kpi/${row.id}/review`, "POST", { action }); toast(action === "lock" ? "Evaluasi dikunci" : "Evaluasi dibuka"); reload(); }
    catch (e) { toast((e as Error).message, "err"); }
  };
  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Kinerja" title="Target & Evaluasi KPI" desc="Pantau pencapaian per kategori, brand, cabang, dan PIC. Pilih indikator jumlah, persen, rupiah, atau rating. Kategori KPI dan konten dikelola di Pengaturan → Daftar Pilihan." />
      <div className="flex flex-wrap gap-2"><button className="btn btn-accent" onClick={() => setEditing(null)}>+ Tambah KPI</button><button className="btn" onClick={() => setImporting(true)}>Impor KPI</button><button className="btn" onClick={reload} disabled={loading}>{loading ? "Memuat…" : "Perbarui"}</button></div>
      <Card title="Pencapaian per Kategori" subtitle="Hanya indikator dan informasi yang diisi yang ditampilkan. Penilaian mengikuti target minimal atau batas maksimal.">
        {error && <p role="alert">{error}</p>}
        {loading && <p role="status" className="mb-3 text-sm text-[var(--muted)]">Memuat evaluasi KPI…</p>}
        {data && <KpiBoard cards={data.scorecards} onEdit={setEditing} onDelete={session?.role && session.role !== "staff" ? remove : undefined} onReview={session?.role && session.role !== "staff" ? review : undefined} />}
      </Card>
      {editing !== undefined && <KpiForm row={editing} defaults={{ brand: f.brand || "" }} onClose={() => setEditing(undefined)} onSaved={reload} />}
      {importing && <ImportDialog resourceKey="kpi" onClose={() => setImporting(false)} onDone={reload} />}
    </div>
  );
}
