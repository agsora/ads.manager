"use client";

import { useMemo, useState } from "react";
import { PageHeader } from "@/components/shell";
import { ResourceTable } from "@/components/resource-table";
import { useFetch, useFilter } from "@/components/providers";
import { Card, Kpi } from "@/components/charts";
import { n, type Row } from "@/lib/resources";
import { fmtDate } from "@/lib/format";

const DONE = ["APPROVED", "DISETUJUI", "APPROVE"];
const REJECT = ["REJECTED", "DITOLAK", "REJECT"];
const CANCEL = ["CANCELLED", "BATAL", "CANCEL"];
const is = (r: Row, list: string[]) => list.includes(String(r.status ?? "").trim().toUpperCase());
const isReinput = (r: Row) => r.tipe_masuk === "Input ulang";

type Show = "semua" | "dm" | "ulang";

export default function BerkasPage() {
  const f = useFilter();
  const [tick, setTick] = useState(0);
  const [show, setShow] = useState<Show>("semua");
  const { data } = useFetch<{ rows: Row[] }>(`/api/r/berkas?from=${f.from}&to=${f.to}&_=${tick}`);
  const rows = useMemo(() => data?.rows ?? [], [data]);

  const k = useMemo(() => {
    const dm = rows.filter((r) => !isReinput(r));
    const approved = dm.filter((r) => is(r, DONE)).length;
    const rejected = dm.filter((r) => is(r, REJECT)).length;
    const cancelled = dm.filter((r) => is(r, CANCEL)).length;
    const cair = dm.filter((r) => r.tgl_cair);
    const last = rows.map((r) => String(r.updated_at ?? "")).sort().pop();
    return {
      total: dm.length,
      approved,
      rejected,
      cancelled,
      process: dm.length - approved - rejected - cancelled,
      cair: cair.length,
      pokok: cair.reduce((s, r) => s + n(r.pokok), 0),
      ulang: rows.length - dm.length,
      konven: dm.filter((r) => r.segment === "Konvensional").length,
      syariah: dm.filter((r) => r.segment === "Syariah").length,
      last,
    };
  }, [rows]);

  const filter = useMemo(() => (show === "semua" ? undefined : (r: Row) => (show === "ulang" ? isReinput(r) : !isReinput(r))), [show]);
  const pills: { v: Show; t: string }[] = [
    { v: "semua", t: `Semua (${rows.length})` },
    { v: "dm", t: `Digital Marketing (${k.total})` },
    { v: "ulang", t: `Input ulang NIK sama (${k.ulang})` },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Berkas In"
        title="Berkas In Digital Marketing"
        desc="Berkas pengajuan yang masuk lewat Digital Marketing: nama CMO-nya Digital Marketing (Konvensional) atau Asal Berkas-nya Digital Marketing (Syariah). Berkas yang diinput ulang dengan NIK yang sama (pemohon atau pasangan) dalam 30 hari setelahnya ikut ditampilkan sebagai Input ulang. Data dibaca hanya-baca dari database sumber dan diperbarui lewat sinkronisasi (npm run sync:berkas)."
      />
      <div className="stat-grid">
        <Kpi label="Berkas masuk" value={k.total} format="number" />
        <Kpi label="Disetujui" value={k.approved} format="number" />
        <Kpi label="Ditolak" value={k.rejected} format="number" />
        <Kpi label="Batal" value={k.cancelled} format="number" />
        <Kpi label="Dalam proses" value={k.process} format="number" />
        <Kpi label="Sudah cair" value={k.cair} format="number" />
        <Kpi label="Pokok cair" value={k.pokok} format="money" />
        <Kpi label="Input ulang ≤30 hari" value={k.ulang} format="number" />
      </div>
      <p className="text-[12.5px] text-[var(--muted)]">
        Konvensional {k.konven} · Syariah {k.syariah}
        {k.last ? ` · data terakhir disinkronkan ${fmtDate(k.last.slice(0, 10))}` : ""}
      </p>
      {rows.length === 0 && data && (
        <Card title="Belum ada data berkas">
          <p className="text-[13.5px] text-[var(--ink-2)]">
            Di komputer yang bisa menjangkau database Konvensional dan Syariah, jalankan <code>npm run sync:berkas</code>. Perintah itu hanya membaca (SELECT) lalu menyimpan berkas Digital Marketing ke menu ini.
          </p>
        </Card>
      )}
      <div className="flex flex-wrap gap-1.5">
        {pills.map((p) => (
          <button key={p.v} type="button" className="pill" aria-pressed={show === p.v} style={show === p.v ? { borderColor: "var(--ink)", background: "var(--surface-2)" } : undefined} onClick={() => setShow(p.v)}>
            {p.t}
          </button>
        ))}
      </div>
      <ResourceTable resourceKey="berkas" freeze={["tgl_masuk", "segment", "tipe_masuk", "source_id", "nama"]} rowFilter={filter} allowCreate={false} onChanged={() => setTick((t) => t + 1)} searchPlaceholder="Cari nama, no. berkas, CMO, cabang…" />
    </div>
  );
}
