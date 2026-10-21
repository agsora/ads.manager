"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Session } from "@/lib/token";
import { addDays, monthEnd, monthStart, todayISO } from "@/lib/format";

export interface Brand {
  id: number;
  name: string;
  industry: string | null;
  color: string | null;
  notes: string | null;
}

interface Meta {
  session: Session | null;
  brands: Brand[];
  options: Record<string, string[]>;
  users: { id: number; name: string }[];
  reloadMeta: () => Promise<void>;
  ready: boolean;
}

export type Preset = "this_month" | "last_month" | "last_7" | "last_30" | "last_90" | "this_year" | "custom";
interface Filter {
  from: string;
  to: string;
  brand: string;
  preset: Preset;
  setPreset: (p: Preset) => void;
  setRange: (from: string, to: string) => void;
  setBrand: (b: string) => void;
  qs: string;
}

const MetaCtx = createContext<Meta | null>(null);
const FilterCtx = createContext<Filter | null>(null);
const ToastCtx = createContext<(msg: string, kind?: "ok" | "err") => void>(() => {});

export function rangeFor(p: Preset): [string, string] {
  const t = todayISO();
  switch (p) {
    case "last_month": {
      const lm = addDays(monthStart(t), -1);
      return [monthStart(lm), monthEnd(lm)];
    }
    case "last_7":
      return [addDays(t, -6), t];
    case "last_30":
      return [addDays(t, -29), t];
    case "last_90":
      return [addDays(t, -89), t];
    case "this_year":
      return [t.slice(0, 4) + "-01-01", t.slice(0, 4) + "-12-31"];
    default:
      return [monthStart(t), monthEnd(t)];
  }
}

export const PRESETS: { key: Preset; label: string }[] = [
  { key: "this_month", label: "Bulan ini" },
  { key: "last_month", label: "Bulan lalu" },
  { key: "last_7", label: "7 hari terakhir" },
  { key: "last_30", label: "30 hari terakhir" },
  { key: "last_90", label: "90 hari terakhir" },
  { key: "this_year", label: "Tahun ini" },
  { key: "custom", label: "Custom" },
];

export function Providers({ children }: { children: React.ReactNode }) {
  const [meta, setMeta] = useState<Omit<Meta, "reloadMeta">>({ session: null, brands: [], options: {}, users: [], ready: false });
  const [toasts, setToasts] = useState<{ id: number; msg: string; kind: "ok" | "err" }[]>([]);

  const reloadMeta = useCallback(async () => {
    const r = await fetch("/api/meta");
    if (r.status === 401) {
      window.location.href = "/login";
      return;
    }
    const j = await r.json();
    setMeta({ session: j.session, brands: j.brands, options: j.options, users: j.users ?? [], ready: true });
  }, []);
  useEffect(() => {
    reloadMeta();
  }, [reloadMeta]);

  const [f, setF] = useState<{ from: string; to: string; brand: string; preset: Preset }>(() => {
    const [from, to] = rangeFor("this_month");
    return { from, to, brand: "", preset: "this_month" };
  });
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("am_filter") || "null");
      if (saved?.preset) {
        const [from, to] = saved.preset === "custom" ? [saved.from, saved.to] : rangeFor(saved.preset);
        setF({ from, to, brand: saved.brand ?? "", preset: saved.preset });
      }
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("am_filter", JSON.stringify(f));
    } catch {
      /* ignore */
    }
  }, [f]);

  const filter = useMemo<Filter>(
    () => ({
      ...f,
      setPreset: (p) => {
        if (p === "custom") setF((x) => ({ ...x, preset: "custom" }));
        else {
          const [from, to] = rangeFor(p);
          setF((x) => ({ ...x, from, to, preset: p }));
        }
      },
      setRange: (from, to) => setF((x) => ({ ...x, from, to, preset: "custom" })),
      setBrand: (brand) => setF((x) => ({ ...x, brand })),
      qs: new URLSearchParams({ from: f.from, to: f.to, ...(f.brand ? { brand: f.brand } : {}) }).toString(),
    }),
    [f],
  );

  const toast = useCallback((msg: string, kind: "ok" | "err" = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, msg, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);

  return (
    <MetaCtx.Provider value={{ ...meta, reloadMeta }}>
      <FilterCtx.Provider value={filter}>
        <ToastCtx.Provider value={toast}>
          {children}
          <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 no-print">
            {toasts.map((t) => (
              <div
                key={t.id}
                className={`rounded-lg px-4 py-2.5 text-sm font-medium text-white shadow-lg ${t.kind === "err" ? "bg-[var(--critical)]" : "bg-slate-900"}`}
              >
                {t.msg}
              </div>
            ))}
          </div>
        </ToastCtx.Provider>
      </FilterCtx.Provider>
    </MetaCtx.Provider>
  );
}

export const useMeta = () => useContext(MetaCtx)!;
export const useFilter = () => useContext(FilterCtx)!;
export const useToast = () => useContext(ToastCtx);

/** Tiny fetch hook with reload. */
export function useFetch<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!url) return;
    let alive = true;
    setLoading(true);
    fetch(url)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "Gagal memuat data");
        return j as T;
      })
      .then((j) => alive && (setData(j), setError(null)))
      .catch((e) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [url, tick]);
  return { data, error, loading, reload: () => setTick((t) => t + 1) };
}

export async function api<T = unknown>(url: string, method: string, body?: unknown): Promise<T> {
  const r = await fetch(url, {
    method,
    headers: body instanceof FormData ? undefined : { "Content-Type": "application/json" },
    body: body instanceof FormData ? body : body !== undefined ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Terjadi kesalahan");
  return j as T;
}
