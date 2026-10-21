"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard, Lightbulb, FileBarChart, Megaphone, Wallet, CalendarDays, Target, Users, CalendarHeart,
  MessageCircle, PhoneCall, Send, Star, Sparkles, ArrowUpDown, Settings, LogOut, Menu, X, Filter,
} from "lucide-react";
import { PRESETS, useFilter, useMeta, type Preset } from "./providers";

const NAV: { section?: string; items: { href: string; label: string; icon: React.ComponentType<{ size?: number }> }[] }[] = [
  {
    items: [
      { href: "/", label: "Dashboard", icon: LayoutDashboard },
      { href: "/insights", label: "Insight & Rekomendasi", icon: Lightbulb },
      { href: "/reports", label: "Laporan", icon: FileBarChart },
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
    section: "Leads & CRM",
    items: [
      { href: "/leads", label: "WA Leads", icon: MessageCircle },
      { href: "/leads/followup", label: "Follow Up", icon: PhoneCall },
      { href: "/blast", label: "WA Blast", icon: Send },
    ],
  },
  {
    section: "Reputasi & Partner",
    items: [
      { href: "/reviews", label: "Google Business", icon: Star },
      { href: "/influencers", label: "Influencer", icon: Sparkles },
    ],
  },
  {
    section: "Data",
    items: [
      { href: "/data", label: "Impor / Ekspor", icon: ArrowUpDown },
      { href: "/settings", label: "Pengaturan", icon: Settings },
    ],
  },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { session } = useMeta();
  const [open, setOpen] = useState(false);
  // the nav item with the longest href that prefixes the current path wins
  const current = NAV.flatMap((g) => g.items.map((i) => i.href))
    .filter((h) => (h === "/" ? path === "/" : path === h || path.startsWith(h + "/")))
    .sort((a, b) => b.length - a.length)[0];
  const active = (href: string) => href === current;

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  };

  return (
    <div className="min-h-screen">
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-[#0f172a] text-slate-300 transition-transform lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="flex h-16 items-center gap-2.5 px-5">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--accent)] text-white">
            <Megaphone size={18} />
          </div>
          <div className="min-w-0">
            <div className="text-[15px] font-bold leading-tight text-white">Ads Manager</div>
            <div className="truncate text-[11.5px] text-slate-400">{session?.orgName ?? "…"}</div>
          </div>
          <button className="ml-auto text-slate-400 lg:hidden" onClick={() => setOpen(false)} aria-label="Tutup menu">
            <X size={20} />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 pb-4">
          {NAV.map((g, gi) => (
            <div key={gi} className="mt-3">
              {g.section && <div className="px-3 pb-1.5 pt-2 text-[10.5px] font-bold uppercase tracking-wider text-slate-500">{g.section}</div>}
              {g.items.map((it) => {
                const Icon = it.icon;
                const on = active(it.href);
                return (
                  <Link
                    key={it.href}
                    href={it.href}
                    onClick={() => setOpen(false)}
                    className={`mb-0.5 flex items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] font-medium transition ${on ? "bg-white/10 text-white" : "hover:bg-white/5 hover:text-white"}`}
                  >
                    <Icon size={17} />
                    {it.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="border-t border-white/10 p-3">
          <div className="flex items-center gap-3 rounded-lg px-2 py-2">
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/10 text-sm font-bold text-white">
              {session?.name?.[0]?.toUpperCase() ?? "?"}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-semibold text-white">{session?.name}</div>
              <div className="truncate text-[11.5px] capitalize text-slate-400">{session?.role}</div>
            </div>
            <button onClick={logout} className="rounded-md p-1.5 text-slate-400 hover:bg-white/10 hover:text-white" title="Keluar" aria-label="Keluar">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>
      {open && <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setOpen(false)} />}
      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex min-h-16 flex-wrap items-center gap-3 border-b border-[var(--line)] bg-white/90 px-4 py-2.5 backdrop-blur lg:px-8">
          <button className="btn btn-sm lg:hidden" onClick={() => setOpen(true)} aria-label="Buka menu">
            <Menu size={16} />
          </button>
          <GlobalFilter />
        </header>
        <main className="px-4 py-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}

function GlobalFilter() {
  const f = useFilter();
  const { brands } = useMeta();
  return (
    <div className="ml-auto flex flex-wrap items-center gap-2">
      <Filter size={15} className="text-[var(--muted)]" />
      <select className="input !h-9 !w-auto !text-[13px]" value={f.brand} onChange={(e) => f.setBrand(e.target.value)} aria-label="Filter brand">
        <option value="">Semua brand</option>
        {brands.map((b) => (
          <option key={b.id} value={b.name}>
            {b.name}
          </option>
        ))}
      </select>
      <select className="input !h-9 !w-auto !text-[13px]" value={f.preset} onChange={(e) => f.setPreset(e.target.value as Preset)} aria-label="Periode">
        {PRESETS.map((p) => (
          <option key={p.key} value={p.key}>
            {p.label}
          </option>
        ))}
      </select>
      <input type="date" className="input !h-9 !w-[140px] !text-[13px]" value={f.from} onChange={(e) => f.setRange(e.target.value, f.to)} aria-label="Dari tanggal" />
      <span className="text-sm text-[var(--muted)]">–</span>
      <input type="date" className="input !h-9 !w-[140px] !text-[13px]" value={f.to} onChange={(e) => f.setRange(f.from, e.target.value)} aria-label="Sampai tanggal" />
    </div>
  );
}

export function PageHeader({ title, desc, children }: { title: string; desc?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-[22px] font-bold tracking-tight">{title}</h1>
        {desc && <p className="mt-1 max-w-3xl text-[13.5px] text-[var(--ink-2)]">{desc}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2 no-print">{children}</div>}
    </div>
  );
}
