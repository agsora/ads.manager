"use client";

import { useState } from "react";
import { DatabaseBackup, Download, FileDown, FileSpreadsheet, Upload } from "lucide-react";
import { PageHeader } from "@/components/shell";
import { useFilter } from "@/components/providers";
import { ImportDialog } from "@/components/import-dialog";
import { Card } from "@/components/charts";
import { RESOURCES } from "@/lib/resources";

export default function DataPage() {
  const f = useFilter();
  const [imp, setImp] = useState<string | null>(null);
  return (
    <div className="space-y-5">
      <PageHeader title="Impor / Ekspor Data" desc="Pindahkan data dari/ke Excel. Impor otomatis mengenali sheet workbook 'WEBSITE MARKETING REPORT' (Ads Report - Detail Ads, Ads Report - Ringkasan, Input Content Plan, WA Leads, Google Business Report) beserta judul kolomnya." />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Impor Workbook Lengkap" subtitle="Satu file Excel berisi banyak sheet — tiap sheet dipetakan ke modul yang sesuai">
          <ul className="mb-4 list-disc space-y-1 pl-5 text-[13px] text-[var(--ink-2)]">
            <li>Brand diambil dari kolom Brand, nama sheet (mis. &quot;WA Leads - CMD Finance&quot;), atau brand default.</li>
            <li>Baris tanpa data kunci (nama campaign / tanggal / nama / no. WA) otomatis dilewati.</li>
            <li>Gunakan <b>Pratinjau</b> untuk melihat hasil pemetaan sebelum menyimpan.</li>
          </ul>
          <button className="btn btn-primary" onClick={() => setImp("auto")}>
            <FileSpreadsheet size={15} /> Impor Workbook
          </button>
        </Card>
        <Card title="Backup Seluruh Data" subtitle="Semua modul dalam satu file Excel (bisa diimpor kembali)">
          <p className="mb-4 text-[13px] text-[var(--ink-2)]">Ekspor mengikuti filter brand & periode yang aktif di atas. Kosongkan brand dan pilih &quot;Tahun ini&quot; atau rentang panjang untuk backup penuh.</p>
          <div className="flex flex-wrap gap-2">
            <a className="btn btn-primary" href={`/api/export?resource=all&${f.qs}`}>
              <DatabaseBackup size={15} /> Ekspor periode ini
            </a>
            <a className="btn" href={`/api/export?resource=all&from=1900-01-01&to=2999-12-31`}>
              <Download size={15} /> Ekspor semua (tanpa filter)
            </a>
          </div>
        </Card>
      </div>
      <Card title="Per Modul">
        <div className="-mx-5 overflow-x-auto">
          <table className="data">
            <thead>
              <tr>
                <th>Modul</th>
                <th>Keterangan</th>
                <th className="text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {RESOURCES.map((r) => (
                <tr key={r.key}>
                  <td className="whitespace-nowrap font-semibold">{r.label}</td>
                  <td className="text-[12.5px] text-[var(--ink-2)]">{r.description}</td>
                  <td>
                    <div className="flex justify-end gap-1.5">
                      <a className="btn btn-sm" href={`/api/template?resource=${r.key}`}>
                        <FileDown size={13} /> Template
                      </a>
                      <button className="btn btn-sm" onClick={() => setImp(r.key)}>
                        <Upload size={13} /> Impor
                      </button>
                      <a className="btn btn-sm" href={`/api/export?resource=${r.key}&format=xlsx&${f.qs}`}>
                        Excel
                      </a>
                      <a className="btn btn-sm" href={`/api/export?resource=${r.key}&format=csv&${f.qs}`}>
                        CSV
                      </a>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      {imp && <ImportDialog resourceKey={imp} onClose={() => setImp(null)} onDone={() => {}} />}
    </div>
  );
}
