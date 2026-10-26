"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BellRing, Mail, Play, Send, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/shell";
import { api, useFetch, useMeta, useToast } from "@/components/providers";
import { Card } from "@/components/charts";
import { NoteRow, type Note } from "@/components/notification-bell";

interface Prefs {
  prefs: Record<string, boolean>;
  categories: Record<string, { label: string; desc: string; emailDefault: boolean }>;
  emailEnabled: boolean;
  email: string;
  sender: string;
}

export default function NotificationsPage() {
  const router = useRouter();
  const toast = useToast();
  const { session } = useMeta();
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const { data, reload } = useFetch<{ items: Note[]; unread: number }>(`/api/notifications?limit=200${filter === "unread" ? "&unread=1" : ""}`);
  const prefs = useFetch<Prefs>("/api/notifications/prefs");
  const [busy, setBusy] = useState("");
  const [perm, setPerm] = useState<string>("default");
  useEffect(() => {
    if (typeof Notification !== "undefined") setPerm(Notification.permission);
    else setPerm("unsupported");
  }, []);

  const manager = session && ["superadmin", "owner", "admin"].includes(session.role);
  const run = async (key: string, fn: () => Promise<string>) => {
    setBusy(key);
    try {
      toast(await fn());
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy("");
    }
  };
  const toggle = async (k: string, v: boolean) => {
    await api("/api/notifications/prefs", "PUT", { [k]: v });
    prefs.reload();
    toast(v ? "Email diaktifkan" : "Email dimatikan");
  };

  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Notifikasi" title="Pusat notifikasi" desc="Semua kabar tim di satu tempat: rencana konten baru & perubahan, approval, lead HOT, peringatan otomatis setiap pagi, dan laporan mingguan. Atur email mana yang ingin Anda terima." />

      <div className="grid gap-4 xl:grid-cols-[1fr_400px]">
        <div className="card min-w-0 overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b border-[var(--line)] px-4 py-3">
            <div className="tabs">
              <button className="tab" data-on={filter === "all"} onClick={() => setFilter("all")}>Semua</button>
              <button className="tab" data-on={filter === "unread"} onClick={() => setFilter("unread")}>
                Belum dibaca {data?.unread ? `(${data.unread})` : ""}
              </button>
            </div>
            <div className="ml-auto flex gap-2">
              <button className="btn btn-sm" onClick={() => run("read", async () => (await api("/api/notifications", "PUT", { all: true }), reload(), "Semua ditandai dibaca"))}>
                Tandai semua dibaca
              </button>
              <button className="btn btn-sm btn-danger" onClick={() => run("clear", async () => (await api("/api/notifications", "DELETE"), reload(), "Notifikasi yang sudah dibaca dihapus"))}>
                <Trash2 size={13} /> Bersihkan
              </button>
            </div>
          </div>
          {data?.items.length ? (
            data.items.map((n) => (
              <NoteRow
                key={n.id}
                n={n}
                onClick={async () => {
                  if (!n.read_at) await api("/api/notifications", "PUT", { ids: [n.id] });
                  if (n.link) router.push(n.link);
                  else reload();
                }}
              />
            ))
          ) : (
            <div className="px-4 py-16 text-center text-[13.5px] text-[var(--muted)]">{data ? "Tidak ada notifikasi." : "Memuat…"}</div>
          )}
        </div>

        <div className="space-y-4">
          <Card title="Email saya" subtitle={prefs.data ? `Dikirim ke ${prefs.data.email}` : undefined}>
            {prefs.data && !prefs.data.emailEnabled && (
              <div className="mb-4 rounded-lg border border-[#eac9bf] bg-[#fbefec] p-3 text-[13px] text-[var(--critical-ink)]">Pengiriman email belum aktif di server (RESEND_API_KEY belum di-set).</div>
            )}
            <div className="divide-y divide-[var(--grid)]">
              {prefs.data &&
                Object.entries(prefs.data.categories).map(([k, c]) => (
                  <label key={k} className="flex cursor-pointer items-start gap-3 py-3">
                    <input type="checkbox" className="mt-1 h-4 w-4 accent-[var(--accent)]" checked={!!prefs.data!.prefs[k]} onChange={(e) => toggle(k, e.target.checked)} />
                    <span>
                      <span className="block text-[14px] font-semibold">{c.label}</span>
                      <span className="block text-[12.5px] leading-relaxed text-[var(--ink-2)]">{c.desc}</span>
                    </span>
                  </label>
                ))}
            </div>
            <button className="btn mt-3" disabled={busy === "test"} onClick={() => run("test", async () => `Email tes dikirim ke ${(await api<{ to: string }>("/api/notifications/test", "POST")).to}`)}>
              <Mail size={15} /> {busy === "test" ? "Mengirim…" : "Kirim email tes"}
            </button>
            {prefs.data && <p className="mt-2 text-[12px] text-[var(--muted)]">Pengirim: {prefs.data.sender}</p>}
          </Card>

          <Card title="Notifikasi desktop" subtitle="Muncul di pojok layar selama tab Ads Manager terbuka">
            {perm === "granted" ? (
              <p className="text-[13.5px] text-[var(--good-ink)]">Aktif di browser ini.</p>
            ) : perm === "unsupported" ? (
              <p className="text-[13.5px] text-[var(--muted)]">Browser ini tidak mendukung notifikasi desktop.</p>
            ) : (
              <button className="btn" onClick={async () => setPerm(await Notification.requestPermission())}>
                <BellRing size={15} /> Aktifkan di browser ini
              </button>
            )}
          </Card>

          {manager && (
            <Card title="Otomasi" subtitle="Berjalan sendiri setiap hari 09.00 WIB; laporan mingguan setiap Senin">
              <ul className="mb-4 list-disc space-y-1 pl-5 text-[13px] leading-relaxed text-[var(--ink-2)]">
                <li>Campaign yang lewat tanggal berakhir otomatis jadi Done</li>
                <li>Peringatan: konten terlewat, menunggu review, hasil belum diisi, lead HOT, saldo iklan menipis, ulasan negatif</li>
                <li>Email ringkasan harian ke tim, laporan mingguan + Excel ke owner/admin</li>
              </ul>
              <div className="flex flex-wrap gap-2">
                <button className="btn" disabled={!!busy} onClick={() => run("daily", async () => {
                  const r = await api<{ alerts: number; digestEmails: number; closedCampaigns: number }>("/api/cron/daily", "POST", {});
                  reload();
                  return `${r.alerts} peringatan · ${r.digestEmails} email ringkasan · ${r.closedCampaigns} campaign ditutup`;
                })}>
                  <Play size={15} /> {busy === "daily" ? "Menjalankan…" : "Jalankan ringkasan sekarang"}
                </button>
                <button className="btn" disabled={!!busy} onClick={() => run("weekly", async () => {
                  const r = await api<{ weeklyEmails: number }>("/api/cron/daily", "POST", { weekly: true });
                  reload();
                  return `Laporan mingguan terkirim ke ${r.weeklyEmails} email`;
                })}>
                  <Send size={15} /> {busy === "weekly" ? "Mengirim…" : "Kirim laporan mingguan"}
                </button>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
