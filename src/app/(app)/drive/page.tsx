"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Check, Copy, ExternalLink, FolderOpen, FolderTree, Plug, Search, Unplug } from "lucide-react";
import { PageHeader } from "@/components/shell";
import { api, useFetch, useMeta, useToast } from "@/components/providers";
import { Card } from "@/components/charts";
import { fmtDate, fmtNum } from "@/lib/format";

interface Overview {
  enabled: boolean;
  rootUrl: string | null;
  folders: { folder_path: string; files: number; bytes: number; last_at: string; folder_url: string | null }[];
  files: { id: number; resource: string; folder_path: string; name: string; url: string; size: number | null; uploaded_by: string | null; created_at: string }[];
  totals: { files: number; bytes: number };
}
interface Conn {
  hasClient: boolean;
  connected: boolean;
  needsFolder: boolean;
  account: string | null;
  rootUrl: string | null;
  redirectUri: string;
}

const mb = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(0, Math.round(n / 1024))} KB`);

export default function DrivePage() {
  return (
    <Suspense fallback={null}>
      <DriveInner />
    </Suspense>
  );
}

function DriveInner() {
  const [term, setTerm] = useState("");
  const toast = useToast();
  const params = useSearchParams();
  const { session } = useMeta();
  const manager = session && ["superadmin", "owner", "admin"].includes(session.role);
  const conn = useFetch<Conn>("/api/drive/oauth");
  const { data } = useFetch<Overview>(`/api/drive/overview?q=${encodeURIComponent(term)}`);
  const [copied, setCopied] = useState(false);
  const c = conn.data;
  const error = params.get("error");

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast("Salin manual", "err");
    }
  };
  const disconnect = async () => {
    if (!confirm("Putuskan Google Drive? File yang sudah ada tetap aman di Drive.")) return;
    await api("/api/drive/oauth", "DELETE");
    conn.reload();
  };

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Data" title="File & Google Drive" desc="Semua file kerja (desain konten, creative iklan, materi influencer, laporan, arsip impor) otomatis tersimpan rapi di Google Drive: Brand → Campaign → jenis file. Upload dilakukan dari tiap menu (kalender konten, campaign iklan, dll).">
        {c?.rootUrl && (
          <a className="btn" href={c.rootUrl} target="_blank" rel="noreferrer">
            <FolderOpen size={15} /> Buka folder utama
          </a>
        )}
      </PageHeader>

      {error && <div className="rounded-lg border border-[#eac9bf] bg-[#fbefec] px-4 py-3 text-[13.5px] text-[var(--critical-ink)]">Gagal menghubungkan: {decodeURIComponent(error)}</div>}
      {params.get("connected") && <div className="rounded-lg border border-[#cfe3c8] bg-[#eaf2e3] px-4 py-3 text-[13.5px] text-[var(--good-ink)]">Google Drive berhasil terhubung.</div>}

      {c?.connected && (
        <Card title="Terhubung ke Google Drive" subtitle={c.account ? `Akun: ${c.account}. File tersimpan di Drive akun ini dan memakai kuota penyimpanannya.` : "File tersimpan di Drive akun yang terhubung."}>
          {manager && (
            <button className="btn btn-sm" onClick={disconnect}>
              <Unplug size={14} /> Putuskan
            </button>
          )}
        </Card>
      )}

      {c && !c.connected && (
        <Card title="Hubungkan Google Drive" subtitle="Memakai Google Drive API dengan izin akun Anda sendiri (bukan service account, yang tidak punya kuota penyimpanan di Drive pribadi).">
          {!c.hasClient ? (
            <ol className="list-decimal space-y-3 pl-5 text-[13.5px] leading-relaxed">
              <li>
                Buka <b>console.cloud.google.com</b> → pilih project Anda → <b>APIs &amp; Services → Library</b> → aktifkan <b>Google Drive API</b>.
              </li>
              <li>
                <b>OAuth consent screen</b>: tipe <b>External</b>, isi nama aplikasi dan email. Tambahkan akun Google Anda di <b>Test users</b>. Agar izin tidak kedaluwarsa tiap 7 hari, klik <b>Publish app</b> (boleh status belum diverifikasi, ini untuk pemakaian pribadi).
              </li>
              <li>
                <b>Credentials → Create credentials → OAuth client ID</b>, tipe <b>Web application</b>. Pada <b>Authorized redirect URIs</b> tambahkan persis:
                <div className="mt-2 flex items-center gap-2">
                  <input readOnly className="input !h-9 flex-1 font-mono !text-[12.5px]" value={c.redirectUri} onFocus={(e) => e.currentTarget.select()} aria-label="Redirect URI" />
                  <button className="btn btn-sm" onClick={() => copy(c.redirectUri)}>
                    {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Tersalin" : "Salin"}
                  </button>
                </div>
              </li>
              <li>
                Salin <b>Client ID</b> dan <b>Client secret</b>, lalu di Vercel → Settings → Environment Variables tambahkan <code>GOOGLE_CLIENT_ID</code> dan <code>GOOGLE_CLIENT_SECRET</code> (<code>DRIVE_FOLDER_ID</code> sudah terisi). Redeploy, lalu kembali ke halaman ini.
              </li>
            </ol>
          ) : (
            <div className="space-y-3 text-[13.5px] leading-relaxed">
              <p>Client ID sudah terpasang. Klik tombol di bawah, login dengan akun Google pemilik folder, lalu izinkan akses Drive.</p>
              {c.needsFolder && <p className="text-[var(--critical-ink)]">DRIVE_FOLDER_ID belum di-set di environment.</p>}
              {manager ? (
                <a className="btn btn-accent" href="/api/drive/oauth/start">
                  <Plug size={15} /> Hubungkan Google Drive
                </a>
              ) : (
                <p className="text-[var(--muted)]">Hanya owner/admin yang bisa menghubungkan.</p>
              )}
              <p className="text-[12.5px] text-[var(--muted)]">Jika muncul peringatan &quot;Google hasn&apos;t verified this app&quot;, pilih Advanced → Go to (nama aplikasi). Itu normal untuk aplikasi pribadi.</p>
            </div>
          )}
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
              <div className="py-8 text-center text-[13.5px] text-[var(--muted)]">Belum ada file. Klik konten di kalender untuk upload desain, atau pakai tombol File di Ads Campaign.</div>
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
