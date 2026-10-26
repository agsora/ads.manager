"use client";

import { ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/shell";
import { ResourceTable } from "@/components/resource-table";

export default function OptoutsPage() {
  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Blast" title="Daftar Jangan Dihubungi" desc="Nomor yang meminta berhenti, salah nomor, atau pernah mengeluh. Nomor di daftar ini otomatis dilewati saat ekspor blast dan remarketing, dan diberi tanda di Papan Follow Up. Menghormati permintaan berhenti melindungi nomor WhatsApp perusahaan dari pemblokiran dan keluhan konsumen." />
      <div className="card flex items-start gap-3 p-4 text-[13.5px] leading-relaxed text-[var(--ink-2)]">
        <ShieldCheck size={18} className="mt-0.5 shrink-0 text-[var(--good)]" />
        <span>
          Cara memasukkan nomor: di tabel <b>WA Leads</b> atau <b>Kontak Blast</b>, centang barisnya lalu klik <b>Jangan dihubungi</b>. Bisa juga ditambah manual atau diimpor dari Excel di sini.
        </span>
      </div>
      <ResourceTable resourceKey="optouts" ignoreDate quickFilters={["reason"]} searchPlaceholder="Cari nomor atau nama…" />
    </div>
  );
}
