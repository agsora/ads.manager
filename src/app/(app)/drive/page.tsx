"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink, FolderOpen, FolderTree, Search } from "lucide-react";
import { PageHeader } from "@/components/shell";
import { useFetch, useToast } from "@/components/providers";
import { Card } from "@/components/charts";
import { DRIVE_SCRIPT } from "@/lib/drive-script";
import { fmtDate, fmtNum } from "@/lib/format";

interface Overview {
  enabled: boolean;
  rootUrl: string | null;
  folders: { folder_path: string; files: number; bytes: number; last_at: string; folder_url: string | null }[];
  files: { id: number; resource: string; folder_path: string; name: string; url: string; size: number | null; uploaded_by: string | null; created_at: string }[];
  totals: { files: number; bytes: number };
}

const ROOT_ID = "1wCtjhK7YDFSuxsP-wfwY3oY4e_NeKlSM";
const mb = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(0, Math.round(n / 1024))} KB`);

export default function DrivePage() {
  const [term, setTerm] = useState("");
  const { data } = useFetch<Overview>(`/api/drive/overview?q=${encodeURIComponent(term)}`);
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const code = DRIVE_SCRIPT(ROOT_ID);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast("Salin manual dari kotak kode", "err");
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Data" title="File & Google Drive" desc="Semua file kerja (desain konten, creative iklan, materi influencer, laporan, arsip impor) otomatis tersimpan rapi di Google Drive: Brand → Campaign → jenis file. Upload dilakukan dari tiap menu (kalender konten, campaign iklan, dll).">
        {data?.rootUrl && (
          <a className="btn" href={data.rootUrl} target="_blank" rel="noreferrer">
            <FolderOpen size={15} /> Buka folder utama
          </a>
        )}
      </PageHeader>

      {data && !data.enabled && (
        <Card title="Hubungkan Google Drive (sekali saja, ±5 menit)" subtitle="Akun layanan (service account) tidak bisa menyimpan file di Drive pribadi, jadi upload dijembatani oleh skrip kecil yang berjalan atas nama akun Drive Anda.">
          <ol className="list-decimal space-y-3 pl-5 text-[13.5px] leading-relaxed">
            <li>
              Buka <b>script.google.com</b> dengan akun Google pemilik folder → <b>Proyek baru</b>. Hapus isi default, tempel kode di bawah, ganti <code>GANTI_DENGAN_RAHASIA_PANJANG</code> dengan kata sandi acak panjang (catat, dipakai lagi di langkah 4).
            </li>
            <li>
              Klik <b>Deploy → Deployment baru → Jenis: Aplikasi web</b>. Isi <b>Jalankan sebagai: Saya</b> dan <b>Yang memiliki akses: Siapa saja</b>. Klik Deploy, lalu <b>Otorisasi akses</b> (izinkan akses Drive; jika ada peringatan &quot;belum diverifikasi&quot; pilih Lanjutan → Buka).
            </li>
            <li>Salin <b>URL aplikasi web</b> (berakhiran <code>/exec</code>).</li>
            <li>
              Di Vercel → Project → Settings → Environment Variables, tambahkan: <code>DRIVE_SCRIPT_URL</code> (URL tadi), <code>DRIVE_SCRIPT_SECRET</code> (kata sandi langkah 1), dan <code>DRIVE_FOLDER_ID</code> = <code>{ROOT_ID}</code>. Lalu Redeploy.
            </li>
          </ol>
          <div className="mt-4 flex items-center justify-between">
            <div className="text-[12.5px] font-semibold text-[var(--ink-2)]">Kode Apps Script</div>
            <button className="btn btn-sm" onClick={copy}>
              {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Tersalin" : "Salin kode"}
            </button>
          </div>
          <textarea readOnly className="input mt-2 !h-64 font-mono !text-[12px]" value={code} onFocus={(e) => e.currentTarget.select()} aria-label="Kode Apps Script" />
        </Card>
      )}

      {data?.enabled && (
        <div className="stat-grid">
          <Stat label="File tersimpan" value={fmtNum(data.totals?.files ?? 0)} />
          <Stat label="Total ukuran" value={mb(Number(data.totals?.bytes ?? 0))} />
          <Stat label="Folder berisi file" value={fmtNum(data.folders.length)} />
        </div>
      )}

      {data?.enabled && (
        <>
          <Card title="Struktur folder" subtitle="Brand / Campaign / jenis file — dibuat otomatis saat upload pertama">
            {data.folders.length ? (
              <ul className="divide-y divide-[var(--grid)]">
                {data.folders.map((f) => (
                  <li key={f.folder_path} className="flex items-center gap-3 py-2.5 text-[13.5px]">
                    <FolderTree size={16} className="shrink-0 text-[var(--accent-ink)]" />
                    <span className="min-w-0 flex-1 truncate font-medium">{f.folder_path.split("/").join("  /  ")}</span>
                    <span className="shrink-0 text-[12px] text-[var(--muted)]">
                      {f.files} file · {mb(Number(f.bytes))} · {fmtDate(f.last_at)}
                    </span>
                    {f.folder_url && (
                      <a href={f.folder_url} target="_blank" rel="noreferrer" className="btn btn-sm">
                        Buka
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="py-8 text-center text-[13.5px] text-[var(--muted)]">Belum ada file. Upload dari kalender konten (buka konten → bagian &quot;Desain & file&quot;) atau dari tombol File di Ads Campaign.</div>
            )}
          </Card>

          <Card
            title="File terbaru"
            action={
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
                <input className="input !h-8 !w-52 !pl-8 !text-[13px]" placeholder="Cari nama / folder…" value={term} onChange={(e) => setTerm(e.target.value)} />
              </div>
            }
          >
            <div className="-mx-5 overflow-x-auto">
              <table className="data">
                <thead>
                  <tr>
                    <th>Nama</th>
                    <th>Folder</th>
                    <th className="num">Ukuran</th>
                    <th>Oleh</th>
                    <th>Tanggal</th>
                  </tr>
                </thead>
                <tbody>
                  {data.files.map((f) => (
                    <tr key={f.id}>
                      <td>
                        <a href={f.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-medium hover:text-[var(--accent-ink)]">
                          {f.name} <ExternalLink size={12} className="opacity-50" />
                        </a>
                      </td>
                      <td className="text-[12.5px] text-[var(--ink-2)]">{f.folder_path}</td>
                      <td className="num">{f.size ? mb(Number(f.size)) : "–"}</td>
                      <td className="whitespace-nowrap">{f.uploaded_by}</td>
                      <td className="whitespace-nowrap text-[12.5px]">{fmtDate(f.created_at)}</td>
                    </tr>
                  ))}
                  {!data.files.length && (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-[var(--muted)]">
                        Belum ada file
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-4 py-4">
      <div className="text-[12.5px] text-[var(--ink-2)]">{label}</div>
      <div className="serif mt-1 whitespace-nowrap text-[26px] leading-tight">{value}</div>
    </div>
  );
}
