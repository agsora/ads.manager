"use client";

import { useMemo, useState } from "react";
import { CalendarClock, Plus } from "lucide-react";
import { PageHeader } from "@/components/shell";
import { ResourceForm } from "@/components/resource-form";
import { useFetch } from "@/components/providers";
import { Card, Empty } from "@/components/charts";
import { addDays, fmtDate, fmtNum, todayISO } from "@/lib/format";
import { RESOURCE_MAP, type Row } from "@/lib/resources";

const blast = RESOURCE_MAP.blast;

export default function BlastSchedulePage() {
  const today = todayISO();
  const [tick, setTick] = useState(0);
  const [editing, setEditing] = useState<Row | null | undefined>(undefined);
  const { data, loading } = useFetch<{ rows: Row[] }>(`/api/r/blast?from=${addDays(today, -7)}&to=${addDays(today, 120)}&t=${tick}`);

  // upcoming = not sent yet; overdue = planned date has passed but still Draft/Terjadwal
  const { overdue, upcoming, recent } = useMemo(() => {
    const rows = [...(data?.rows ?? [])].sort((a, b) => `${a.blast_date}${a.blast_time ?? ""}`.localeCompare(`${b.blast_date}${b.blast_time ?? ""}`));
    const pending = rows.filter((r) => !r.status || r.status === "Draft" || r.status === "Terjadwal");
    return {
      overdue: pending.filter((r) => String(r.blast_date) < today),
      upcoming: pending.filter((r) => String(r.blast_date) >= today),
      recent: rows.filter((r) => r.status === "Terkirim" || r.status === "Gagal").slice(-5).reverse(),
    };
  }, [data, today]);

  const when = (r: Row) => {
    const d = String(r.blast_date);
    const rel = d === today ? "Hari ini" : d === addDays(today, 1) ? "Besok" : fmtDate(d);
    return `${rel}${r.blast_time ? ` · ${String(r.blast_time).slice(0, 5)}` : ""}`;
  };

  const row = (r: Row, late?: boolean) => (
    <li key={String(r.id)} className="flex items-center gap-3 py-3">
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${late ? "bg-[#fbefec] text-[var(--critical-ink)]" : "bg-[var(--accent-soft)] text-[var(--accent-ink)]"}`}>
        <CalendarClock size={16} />
      </span>
      <button className="min-w-0 flex-1 text-left" onClick={() => setEditing(r)}>
        <span className="block truncate text-[14.5px] font-medium">{String(r.campaign_name)}</span>
        <span className="block truncate text-[12.5px] text-[var(--muted)]">
          {[r.brand, r.audience, r.total_target ? `${fmtNum(Number(r.total_target))} kontak` : null, r.tool].filter(Boolean).join(" · ")}
        </span>
      </button>
      <span className={`shrink-0 text-right text-[13px] ${late ? "font-semibold text-[var(--critical-ink)]" : ""}`}>
        {late ? `Terlewat · ${fmtDate(r.blast_date)}` : when(r)}
        <span className="block text-[11.5px] font-normal text-[var(--muted)]">{String(r.status ?? "Draft")}</span>
      </span>
    </li>
  );

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="WhatsApp" title="Jadwal Broadcast" desc="Rencana pengiriman blast WhatsApp berikutnya. Tim mendapat pengingat otomatis pada hari-H dan sehari sebelumnya selama statusnya masih Draft atau Terjadwal. Ubah menjadi Terkirim setelah dikirim, lalu isi hasilnya di tab WA Blast.">
        <button className="btn btn-primary" onClick={() => setEditing(null)}>
          <Plus size={15} /> Jadwalkan blast
        </button>
      </PageHeader>

      {overdue.length > 0 && (
        <Card title="Terlewat, belum ditandai terkirim" subtitle="Klik untuk mengubah status atau menjadwalkan ulang">
          <ul className="divide-y divide-[var(--line)]">{overdue.map((r) => row(r, true))}</ul>
        </Card>
      )}

      <Card title="Akan datang" subtitle="Urut dari yang paling dekat">
        {loading && !data ? (
          <div className="skel h-24 w-full" />
        ) : upcoming.length ? (
          <ul className="divide-y divide-[var(--line)]">{upcoming.map((r) => row(r))}</ul>
        ) : (
          <Empty text="Belum ada blast terjadwal — klik “Jadwalkan blast”" />
        )}
      </Card>

      {recent.length > 0 && (
        <Card title="Baru selesai">
          <ul className="divide-y divide-[var(--line)]">{recent.map((r) => row(r))}</ul>
        </Card>
      )}

      {editing !== undefined && (
        <ResourceForm
          resource={blast}
          row={editing}
          defaults={{ status: "Terjadwal", blast_date: addDays(today, 1) }}
          onClose={() => setEditing(undefined)}
          onSaved={() => (setEditing(undefined), setTick((t) => t + 1))}
        />
      )}
    </div>
  );
}
