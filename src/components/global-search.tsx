"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";

interface Hit {
  type: string;
  title: string;
  sub: string;
  href: string;
}

export function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [idx, setIdx] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    if (open) setTimeout(() => input.current?.focus(), 30);
    else {
      setTerm("");
      setHits([]);
    }
  }, [open]);
  useEffect(() => {
    if (term.trim().length < 2) {
      setHits([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(term)}`);
        const j = await r.json();
        setHits(j.hits ?? []);
        setIdx(0);
      } catch {
        setHits([]);
      }
    }, 220);
    return () => clearTimeout(t);
  }, [term]);

  const go = (h: Hit) => {
    setOpen(false);
    router.push(h.href);
  };

  return (
    <>
      <button className="btn btn-sm !px-2.5 text-[var(--muted)]" onClick={() => setOpen(true)} aria-label="Cari (Ctrl+K)">
        <Search size={15} />
        <span className="hidden sm:inline">Cari</span>
        <kbd className="hidden rounded border border-[var(--line)] px-1 text-[10.5px] sm:inline">Ctrl K</kbd>
      </button>
      {open && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center bg-[#1f1e1d]/35 p-4 pt-[12vh]" onMouseDown={() => setOpen(false)}>
          <div className="w-full max-w-xl overflow-hidden rounded-xl border border-[var(--line)] bg-white shadow-2xl" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label="Pencarian">
            <div className="flex items-center gap-3 border-b border-[var(--line)] px-4">
              <Search size={16} className="text-[var(--muted)]" />
              <input
                ref={input}
                autoFocus
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setIdx((i) => Math.min(hits.length - 1, i + 1));
                  }
                  if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setIdx((i) => Math.max(0, i - 1));
                  }
                  if (e.key === "Enter" && hits[idx]) go(hits[idx]);
                }}
                placeholder="Cari lead, nomor, kontrak, campaign, konten, ulasan…"
                className="h-12 flex-1 bg-transparent text-[14.5px] outline-none"
              />
            </div>
            <div className="max-h-[50vh] overflow-y-auto">
              {hits.map((h, i) => (
                <button key={i} onMouseEnter={() => setIdx(i)} onClick={() => go(h)} className={`flex w-full items-center gap-3 px-4 py-2.5 text-left ${i === idx ? "bg-[var(--surface-2)]" : ""}`}>
                  <span className="chip w-[92px] shrink-0 justify-center">{h.type}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-medium">{h.title}</span>
                    {h.sub && <span className="block truncate text-[12px] text-[var(--muted)]">{h.sub}</span>}
                  </span>
                </button>
              ))}
              {term.trim().length >= 2 && !hits.length && <div className="px-4 py-8 text-center text-[13px] text-[var(--muted)]">Tidak ada hasil untuk &quot;{term}&quot;</div>}
              {term.trim().length < 2 && <div className="px-4 py-8 text-center text-[13px] text-[var(--muted)]">Ketik minimal 2 huruf. Panah atas/bawah untuk memilih, Enter untuk membuka.</div>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
