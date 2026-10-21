"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard, Lightbulb, FileBarChart, Megaphone, Wallet, CalendarDays, Target, Users, CalendarHeart,
  MessageCircle, PhoneCall, Send, Star, Sparkles, ArrowUpDown, Settings, LogOut, Menu, X, ShieldCheck, Bell, FolderOpen,
} from "lucide-react";
import { PRESETS, useFilter, useMeta, type Preset } from "./providers";
import { NotificationBell } from "./notification-bell";
import { GlobalSearch } from "./global-search";

type Item = { href: string; label: string; icon: React.ComponentType<{ size?: number; strokeWidth?: number }> };
const NAV: { section?: string; items: Item[] }[] = [
  {
    items: [
      { href: "/", label: "Ringkasan", icon: LayoutDashboard },
      { href: "/insights", label: "Insight & Saran", icon: Lightbulb },
      { href: "/reports", label: "Laporan", icon: FileBarChart },
      { href: "/notifications", label: "Notifikasi", icon: Bell },
    ],
  },
  {
    section: "Iklan",
    items: [
      { href: "/ads", label: "Ads Campaign", icon: Megaphone },
      { href: "/ads/budget", label: "Saldo & Top Up", icon: Wallet },
    ],
  },
  {
    section: "Konten",
    items: [
      { href: "/content", label: "Content Plan", icon: CalendarDays },
      { href: "/kpi", label: "Target KPI", icon: Target },
      { href: "/followers", label: "Followers", icon: Users },
      { href: "/events", label: "Event & Tanggal", icon: CalendarHeart },
    ],
  },
  {
    section: "Leads & Blast",
    items: [
      { href: "/leads", label: "WA Leads", icon: MessageCircle },
      { href: "/leads/followup", label: "Follow Up", icon: PhoneCall },
      { href: "/blast", label: "WA Blast", icon: Send },
    ],
  },
  {
    section: "Reputasi",
    items: [
      { href: "/reviews", label: "Google Business", icon: Star },
      { href: "/influencers", label: "Influencer", icon: Sparkles },
    ],
  },
  {
    section: "Data",
    items: [
      { href: "/drive", label: "File & Drive", icon: FolderOpen },
      { href: "/data", label: "Impor / Ekspor", icon: ArrowUpDown },
      { href: "/settings", label: "Pengaturan", icon: Settings },
    ],
  },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { session } = useMeta();
  const [open, setOpen] = useState(false);
  const nav = session?.role === "superadmin" ? [...NAV, { section: "Platform", items: [{ href: "/admin", label: "Superadmin", icon: ShieldCheck }] }] : NAV;
  // the nav item with the longest href that prefixes the current path wins
  const current = nav
    .flatMap((g) => g.items.map((i) => i.href))
    .filter((h) => (h === "/" ? path === "/" : path === h || path.startsWith(h + "/")))
    .sort((a, b) => b.length - a.length)[0];

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
        <header className="sticky top-0 z-20 flex min-h-14 flex-wrap items-center gap-3 border-b border-[var(--line)] bg-[var(--bg)]/90 px-4 py-2.5 backdrop-blur lg:px-10">
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
        <main className="page mx-auto max-w-[1440px] px-4 py-7 lg:px-10">{children}</main>
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
  const sel = "input !h-8 !w-auto !rounded-[7px] !px-2.5 !text-[13px]";
  return (
    <div className="ml-auto flex flex-wrap items-center gap-1.5">
      <select className={sel} value={f.brand} onChange={(e) => f.setBrand(e.target.value)} aria-label="Filter brand">
        <option value="">Semua brand</option>
        {brands.map((b) => (
          <option key={b.id} value={b.name}>
            {b.name}
          </option>
        ))}
      </select>
      <select className={sel} value={f.preset} onChange={(e) => f.setPreset(e.target.value as Preset)} aria-label="Periode">
        {PRESETS.map((p) => (
          <option key={p.key} value={p.key}>
            {p.label}
          </option>
        ))}
      </select>
      <input type="date" className={`${sel} !w-[132px]`} value={f.from} onChange={(e) => f.setRange(e.target.value, f.to)} aria-label="Dari tanggal" />
      <span className="text-[var(--muted)]">–</span>
      <input type="date" className={`${sel} !w-[132px]`} value={f.to} onChange={(e) => f.setRange(f.from, e.target.value)} aria-label="Sampai tanggal" />
    </div>
  );
}

export function PageHeader({ title, desc, eyebrow, children }: { title: string; desc?: string; eyebrow?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-3xl">
        {eyebrow && <div className="eyebrow mb-2">{eyebrow}</div>}
        <h1 className="serif text-[32px] font-normal leading-[1.1] tracking-[-0.01em]">{title}</h1>
        {desc && <p className="mt-2 text-[14px] leading-relaxed text-[var(--ink-2)]">{desc}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2 no-print">{children}</div>}
    </div>
  );
}
