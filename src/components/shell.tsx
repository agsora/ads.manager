"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard, Lightbulb, FileBarChart, Megaphone, Wallet, CalendarDays, Target, Users, CalendarHeart,
  MessageCircle, PhoneCall, Send, Star, Sparkles, ArrowUpDown, Settings, LogOut, Menu, X, ShieldCheck, Bell, Gauge, FolderOpen, Filter, Layers, ClipboardList, CalendarClock, Eye, Store, CalendarRange, ChevronDown, Check,
} from "lucide-react";
import { PRESETS, useFilter, useMeta } from "./providers";
import { NotificationBell } from "./notification-bell";
import { MenuItem, Popover } from "./popover";
import { fmtDate } from "@/lib/format";
import { GlobalSearch } from "./global-search";

type Icon = React.ComponentType<{ size?: number; strokeWidth?: number }>;
type Tab = { href: string; label: string; icon: Icon };
/** A sidebar entry; `tabs` are related pages shown as a tab strip at the top of each of them. */
type Item = { href: string; label: string; icon: Icon; tabs?: Tab[] };
const NAV: { section?: string; items: Item[] }[] = [
  {
    items: [
      { href: "/", label: "Ringkasan", icon: LayoutDashboard },
      {
        href: "/insights",
        label: "Insight",
        icon: Lightbulb,
        tabs: [
          { href: "/insights", label: "Insight & Saran", icon: Lightbulb },
          { href: "/funnel", label: "Funnel & Atribusi", icon: Filter },
          { href: "/kpi", label: "Target KPI", icon: Target },
        ],
      },
      { href: "/reports", label: "Laporan", icon: FileBarChart },
    ],
  },
  {
    section: "Kanal",
    items: [
      {
        href: "/ads",
        label: "Iklan",
        icon: Megaphone,
        tabs: [
          { href: "/ads", label: "Ads Campaign", icon: Megaphone },
          { href: "/ads/budget", label: "Saldo & Top Up", icon: Wallet },
          { href: "/creatives", label: "Library Kreatif", icon: Layers },
        ],
      },
      {
        href: "/content",
        label: "Konten",
        icon: CalendarDays,
        tabs: [
          { href: "/content", label: "Content Plan", icon: CalendarDays },
          { href: "/promo", label: "Kalender Promo", icon: CalendarHeart },
          { href: "/snippets", label: "Bank Caption", icon: ClipboardList },
          { href: "/followers", label: "Followers", icon: Users },
        ],
      },
      {
        href: "/leads",
        label: "WhatsApp",
        icon: MessageCircle,
        tabs: [
          { href: "/leads", label: "WA Leads", icon: MessageCircle },
          { href: "/leads/followup", label: "Papan Follow Up", icon: PhoneCall },
          { href: "/blast", label: "WA Blast", icon: Send },
          { href: "/blast/schedule", label: "Jadwal Broadcast", icon: CalendarClock },
          { href: "/performance", label: "Cabang & Respons", icon: Gauge },
        ],
      },
      {
        href: "/reviews",
        label: "Reputasi & Pasar",
        icon: Star,
        tabs: [
          { href: "/reviews", label: "Google Business", icon: Star },
          { href: "/influencers", label: "Influencer", icon: Sparkles },
          { href: "/competitors", label: "Kompetitor", icon: Eye },
        ],
      },
    ],
  },
  {
    section: "Workspace",
    items: [
      {
        href: "/settings",
        label: "Pengaturan",
        icon: Settings,
        tabs: [
          { href: "/settings", label: "Umum & Tim", icon: Settings },
          { href: "/data", label: "Impor / Ekspor", icon: ArrowUpDown },
          { href: "/drive", label: "Google Drive", icon: FolderOpen },
          { href: "/notifications", label: "Notifikasi", icon: Bell },
        ],
      },
    ],
  },
];

const matches = (h: string, path: string) => (h === "/" ? path === "/" : path === h || path.startsWith(h + "/"));
/** Longest matching href wins, so /ads/budget beats /ads. */
const best = (hrefs: string[], path: string) => hrefs.filter((h) => matches(h, path)).sort((a, b) => b.length - a.length)[0];

/** Tab strip linking the pages grouped under one sidebar entry. */
function SectionTabs({ item, path }: { item: Item; path: string }) {
  const tabs = item.tabs!;
  const on = best(tabs.map((t) => t.href), path);
  return (
    <div className="tabs mb-6 no-print" role="tablist">
      {tabs.map((t) => (
        <Link key={t.href} href={t.href} role="tab" aria-selected={t.href === on} className="tab" data-on={t.href === on}>
          <t.icon size={15} /> {t.label}
        </Link>
      ))}
    </div>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { session } = useMeta();
  const [open, setOpen] = useState(false);
  const nav = session?.role === "superadmin" ? [...NAV, { section: "Platform", items: [{ href: "/admin", label: "Superadmin", icon: ShieldCheck }] }] : NAV;
  // the sidebar entry owning the longest href (its own or one of its tabs) that matches the path
  const items = nav.flatMap((g) => g.items);
  const owner = new Map<string, Item>();
  for (const it of items) for (const h of [it.href, ...(it.tabs ?? []).map((t) => t.href)]) owner.set(h, it);
  const currentItem = owner.get(best([...owner.keys()], path) ?? "");
  const current = currentItem?.href;

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  };

  return (
    <div className="min-h-screen">
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-[var(--line)] bg-[var(--sidebar)] transition-transform lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="flex h-16 items-center gap-2.5 px-5">
          <Mark />
          <span className="serif text-[19px] font-medium tracking-tight">Ads Manager</span>
          <button className="ml-auto text-[var(--muted)] lg:hidden" onClick={() => setOpen(false)} aria-label="Tutup menu">
            <X size={20} />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 pb-4">
          {nav.map((g, gi) => (
            <div key={gi} className="mt-2">
              {g.section && <div className="eyebrow px-3 pb-1.5 pt-3">{g.section}</div>}
              {g.items.map((it) => {
                const Icon = it.icon;
                const on = it.href === current;
                return (
                  <Link
                    key={it.href}
                    href={it.href}
                    onClick={() => setOpen(false)}
                    className={`mb-px flex items-center gap-2.5 rounded-lg border px-3 py-[7px] text-[13.5px] transition ${
                      on ? "border-[var(--line)] bg-[var(--surface)] font-semibold text-[var(--ink)] shadow-[0_1px_2px_rgba(31,30,29,.05)]" : "border-transparent text-[var(--ink-2)] hover:bg-[#e8e5db] hover:text-[var(--ink)]"
                    }`}
                  >
                    <span className={on ? "text-[var(--accent)]" : ""}>
                      <Icon size={16} strokeWidth={on ? 2.2 : 1.8} />
                    </span>
                    {it.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="border-t border-[var(--line)] p-3">
          <div className="flex items-center gap-2.5 px-1.5 py-1">
            <div className="serif grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[var(--ink)] text-[14px] text-[#faf9f5]">
              {session?.name?.[0]?.toUpperCase() ?? "·"}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-semibold">{session?.name}</div>
              <div className="truncate text-[11.5px] capitalize text-[var(--muted)]">{session?.role}</div>
            </div>
            <button onClick={logout} className="rounded-md p-1.5 text-[var(--muted)] hover:bg-[#e8e5db] hover:text-[var(--ink)]" title="Keluar" aria-label="Keluar">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>
      {open && <div className="fixed inset-0 z-30 bg-[#1f1e1d]/30 lg:hidden" onClick={() => setOpen(false)} />}
      <div className="lg:pl-60">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-[var(--line)] bg-[var(--bg)]/85 px-3 backdrop-blur-md sm:px-4 lg:px-10">
          <button className="btn btn-sm lg:hidden" onClick={() => setOpen(true)} aria-label="Buka menu">
            <Menu size={16} />
          </button>
          {session?.role === "superadmin" && (
            <Link href="/admin" className="chip !border-[var(--line)] !bg-[var(--surface)]" title="Workspace yang sedang dibuka">
              <ShieldCheck size={12} className="text-[var(--accent)]" /> {session.orgName}
            </Link>
          )}
          <GlobalFilter />
          <GlobalSearch />
          <NotificationBell />
        </header>
        <main className="page mx-auto max-w-[1440px] px-4 py-7 lg:px-10">
          {currentItem?.tabs && (
            <div>
              <SectionTabs item={currentItem} path={path} />
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}

/** Small typographic mark: a clay square with a serif "a". */
function Mark() {
  return (
    <span className="serif grid h-7 w-7 place-items-center rounded-[7px] bg-[var(--accent)] text-[17px] italic leading-none text-white" aria-hidden>
      a
    </span>
  );
}

function GlobalFilter() {
  const f = useFilter();
  const { brands } = useMeta();
  const [from, setFrom] = useState(f.from);
  const [to, setTo] = useState(f.to);
  const label = PRESETS.find((p) => p.key === f.preset && p.key !== "custom")?.label;
  const sameYear = f.from.slice(0, 4) === f.to.slice(0, 4);
  const range = `${sameYear ? fmtDate(f.from).replace(/ \d{4}$/, "") : fmtDate(f.from)} – ${fmtDate(f.to)}`;
  return (
    <div className="ml-auto flex min-w-0 items-center gap-1.5">
      <Popover
        label="Pilih brand"
        width={240}
        button={(open) => (
          <button className={`pill ${open ? "pill-on" : ""}`}>
            <Store size={14} className="text-[var(--muted)]" />
            <span className="max-w-[84px] truncate sm:max-w-[120px]">{f.brand || (<><span className="sm:hidden">Semua</span><span className="hidden sm:inline">Semua brand</span></>)}</span>
            <ChevronDown size={13} className="hidden text-[var(--muted)] sm:block" />
          </button>
        )}
      >
        {(close) => (
          <div className="p-1.5">
            <MenuItem active={!f.brand} onClick={() => (f.setBrand(""), close())} icon={!f.brand ? <Check size={14} /> : null}>
              Semua brand
            </MenuItem>
            {brands.map((b) => (
              <MenuItem key={b.id} active={f.brand === b.name} onClick={() => (f.setBrand(b.name), close())} icon={f.brand === b.name ? <Check size={14} /> : null}>
                {b.name}
              </MenuItem>
            ))}
          </div>
        )}
      </Popover>
      <Popover
        label="Pilih periode"
        width={320}
        button={(open) => (
          <button className={`pill ${open ? "pill-on" : ""}`} onClick={() => (setFrom(f.from), setTo(f.to))}>
            <CalendarRange size={14} className="text-[var(--muted)]" />
            <span className="truncate sm:hidden">{label ?? range}</span>
            <span className="hidden sm:inline">{label ?? "Custom"}</span>
            <span className="hidden truncate text-[var(--muted)] sm:ml-0.5 sm:inline">{range}</span>
            <ChevronDown size={13} className="hidden text-[var(--muted)] sm:block" />
          </button>
        )}
      >
        {(close) => (
          <div>
            <div className="grid grid-cols-2 gap-0.5 p-1.5">
              {PRESETS.filter((p) => p.key !== "custom").map((p) => (
                <MenuItem key={p.key} active={f.preset === p.key} onClick={() => (f.setPreset(p.key), close())} icon={f.preset === p.key ? <Check size={14} /> : null}>
                  {p.label}
                </MenuItem>
              ))}
            </div>
            <div className="border-t border-[var(--line)] p-3">
              <div className="eyebrow mb-2">Rentang tanggal</div>
              <div className="flex items-center gap-2">
                <input type="date" className="input !h-9 !text-[13px]" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Dari tanggal" />
                <span className="text-[var(--muted)]">–</span>
                <input type="date" className="input !h-9 !text-[13px]" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Sampai tanggal" />
              </div>
              <button
                className="btn btn-primary btn-sm mt-3 w-full"
                disabled={!from || !to || from > to}
                onClick={() => {
                  f.setRange(from, to);
                  close();
                }}
              >
                Terapkan
              </button>
            </div>
          </div>
        )}
      </Popover>
    </div>
  );
}

export function PageHeader({ title, desc, eyebrow, children }: { title: string; desc?: string; eyebrow?: string; children?: React.ReactNode }) {
  const [more, setMore] = useState(false);
  const long = (desc?.length ?? 0) > 150;
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-3xl">
        {eyebrow && <div className="eyebrow mb-2">{eyebrow}</div>}
        <h1 className="serif text-[32px] font-normal leading-[1.1] tracking-[-0.01em]">{title}</h1>
        {desc && (
          <p className={`mt-2 text-[14px] leading-relaxed text-[var(--ink-2)] ${long && !more ? "line-clamp-2" : ""}`}>
            {desc}
            {long && more && (
              <button className="ml-1.5 text-[13px] font-semibold text-[var(--accent-ink)]" onClick={() => setMore(false)}>
                Ringkas
              </button>
            )}
          </p>
        )}
        {long && !more && (
          <button className="mt-0.5 text-[13px] font-semibold text-[var(--accent-ink)]" onClick={() => setMore(true)}>
            Selengkapnya
          </button>
        )}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2 no-print">{children}</div>}
    </div>
  );
}
