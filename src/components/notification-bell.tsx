"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Bell, CalendarDays, CheckCheck, FileBarChart, Users } from "lucide-react";
import { api, useToast } from "./providers";

export interface Note {
  id: number;
  category: string;
  title: string;
  body: string | null;
  link: string | null;
  actor: string | null;
  read_at: string | null;
  created_at: string;
}

export const CATEGORY_ICON: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  content: CalendarDays,
  alerts: AlertTriangle,
  digest: Bell,
  weekly: FileBarChart,
  activity: Users,
};

export function timeAgo(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "baru saja";
  if (s < 3600) return `${Math.floor(s / 60)} mnt lalu`;
  if (s < 86400) return `${Math.floor(s / 3600)} jam lalu`;
  if (s < 604800) return `${Math.floor(s / 86400)} hari lalu`;
  return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short" });
}

export function NotificationBell() {
  const router = useRouter();
  const toast = useToast();
  const [items, setItems] = useState<Note[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const lastTop = useRef<number | null>(null);
  const box = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const j = await api<{ items: Note[]; unread: number }>("/api/notifications?limit=12", "GET");
      // announce notifications that arrived since the last poll
      const fresh = lastTop.current === null ? [] : j.items.filter((n) => n.id > lastTop.current! && !n.read_at);
      if (fresh.length) {
        toast(fresh.length === 1 ? fresh[0].title : `${fresh.length} notifikasi baru`);
        if (typeof Notification !== "undefined" && Notification.permission === "granted")
          for (const n of fresh.slice(0, 3)) new Notification(n.title, { body: n.body ?? undefined, tag: `am-${n.id}` });
      }
      lastTop.current = Math.max(lastTop.current ?? 0, ...j.items.map((n) => n.id), 0);
      setItems(j.items);
      setUnread(j.unread);
    } catch {
      /* offline or logged out: try again next tick */
    }
  }, [toast]);

  useEffect(() => {
    load();
    const t = setInterval(load, 45000);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(t);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const openItem = async (n: Note) => {
    setOpen(false);
    if (!n.read_at) await api("/api/notifications", "PUT", { ids: [n.id] }).catch(() => {});
    load();
    if (n.link) router.push(n.link);
  };
  const readAll = async () => {
    await api("/api/notifications", "PUT", { all: true });
    load();
  };

  return (
    <div className="relative" ref={box}>
      <button className="btn btn-sm relative !px-2" onClick={() => setOpen((o) => !o)} aria-label={`Notifikasi, ${unread} belum dibaca`}>
        <Bell size={16} />
        {unread > 0 && (
          <span className="absolute -right-1.5 -top-1.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-[var(--accent)] px-1 text-[10.5px] font-bold text-white tnum">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-10 z-50 w-[min(380px,calc(100vw-24px))] overflow-hidden rounded-xl border border-[var(--line)] bg-white shadow-[0_12px_32px_rgba(31,30,29,.12)]">
          <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
            <span className="serif text-[17px]">Notifikasi</span>
            {unread > 0 && (
              <button className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-[var(--accent-ink)]" onClick={readAll}>
                <CheckCheck size={14} /> Tandai semua dibaca
              </button>
            )}
          </div>
          <div className="max-h-[420px] overflow-y-auto">
            {items.length ? (
              items.map((n) => <NoteRow key={n.id} n={n} onClick={() => openItem(n)} />)
            ) : (
              <div className="px-4 py-10 text-center text-[13px] text-[var(--muted)]">Belum ada notifikasi.</div>
            )}
          </div>
          <Link href="/notifications" onClick={() => setOpen(false)} className="block border-t border-[var(--line)] px-4 py-2.5 text-center text-[13px] font-semibold text-[var(--ink-2)] hover:bg-[var(--surface-2)]">
            Lihat semua & atur email
          </Link>
        </div>
      )}
    </div>
  );
}

export function NoteRow({ n, onClick }: { n: Note; onClick: () => void }) {
  const Icon = CATEGORY_ICON[n.category] ?? Bell;
  return (
    <button onClick={onClick} className={`flex w-full gap-3 border-b border-[var(--grid)] px-4 py-3 text-left hover:bg-[var(--surface-2)] ${n.read_at ? "" : "bg-[#fdf8f4]"}`}>
      <span className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full ${n.category === "alerts" ? "bg-[#f8e4dc] text-[var(--accent-ink)]" : "bg-[var(--surface-2)] text-[var(--ink-2)]"}`}>
        <Icon size={14} />
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block text-[13.5px] leading-snug ${n.read_at ? "" : "font-semibold"}`}>{n.title}</span>
        {n.body && <span className="mt-0.5 line-clamp-2 block text-[12.5px] text-[var(--ink-2)]">{n.body}</span>}
        <span className="mt-1 block text-[11.5px] text-[var(--muted)]">
          {timeAgo(n.created_at)}
          {n.actor ? ` · ${n.actor}` : ""}
        </span>
      </span>
      {!n.read_at && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-[var(--accent)]" aria-label="belum dibaca" />}
    </button>
  );
}
