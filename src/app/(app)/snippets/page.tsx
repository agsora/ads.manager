"use client";

import { useMemo, useState } from "react";
import { Copy, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/shell";
import { ResourceForm } from "@/components/resource-form";
import { api, useFetch, useMeta, useToast } from "@/components/providers";
import { Empty } from "@/components/charts";
import { RESOURCE_MAP, type Row } from "@/lib/resources";

const r = RESOURCE_MAP.snippets;

export default function SnippetsPage() {
  const toast = useToast();
  const { options } = useMeta();
  const [tick, setTick] = useState(0);
  const { data, loading } = useFetch<{ rows: Row[] }>(`/api/r/snippets?t=${tick}`);
  const [kind, setKind] = useState("");
  const [term, setTerm] = useState("");
  const [editing, setEditing] = useState<Row | null | undefined>(undefined);

  const kinds: string[] = options.snippet_kind ?? [];
  const rows = useMemo(() => {
    const t = term.trim().toLowerCase();
    return (data?.rows ?? [])
      .filter((x) => !kind || x.kind === kind)
      .filter((x) => !t || [x.title, x.body, x.tags, x.brand].some((v) => String(v ?? "").toLowerCase().includes(t)))
      .sort((a, b) => Number(b.uses ?? 0) - Number(a.uses ?? 0));
  }, [data, kind, term]);

  const copy = async (row: Row) => {
    try {
      await navigator.clipboard.writeText(String(row.body ?? ""));
      toast("Disalin ke clipboard");
      api(`/api/r/snippets/${row.id}`, "PUT", { uses: Number(row.uses ?? 0) + 1 }).then(() => setTick((x) => x + 1)).catch(() => {});
    } catch {
      toast("Gagal menyalin — salin manual dari kotak teks", "err");
    }
  };
  const remove = async (row: Row) => {
    if (!confirm(`Hapus template "${row.title}"?`)) return;
    try {
      await api(`/api/r/snippets/${row.id}`, "DELETE");
      setTick((x) => x + 1);
    } catch (e) {
      toast((e as Error).message, "err");
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Konten" title="Bank Caption & Template" desc="Simpan caption, hashtag, CTA, dan balasan WhatsApp yang sudah terbukti bagus. Klik Salin, tempel di mana saja — yang paling sering dipakai naik ke atas.">
        <button className="btn btn-primary" onClick={() => setEditing(null)}>
          <Plus size={15} /> Template baru
        </button>
      </PageHeader>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1 sm:max-w-sm">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
          <input className="input !pl-9" placeholder="Cari judul, isi, atau tag…" value={term} onChange={(e) => setTerm(e.target.value)} aria-label="Cari template" />
        </div>
        <div className="tabs">
          <button className="tab" data-on={!kind} onClick={() => setKind("")}>
            Semua
          </button>
          {kinds.map((k) => (
            <button key={k} className="tab" data-on={kind === k} onClick={() => setKind(k)}>
              {k}
            </button>
          ))}
        </div>
      </div>

      {loading && !data ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="card p-5">
              <div className="skel h-4 w-32" />
              <div className="skel mt-4 h-20 w-full" />
            </div>
          ))}
        </div>
      ) : rows.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((row) => (
            <article key={String(row.id)} className="card flex min-w-0 flex-col p-5">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-[15px] font-semibold">{String(row.title)}</h3>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    <span className="chip">{String(row.kind ?? "")}</span>
                    {row.brand ? <span className="chip">{String(row.brand)}</span> : null}
                    {row.channel ? <span className="chip">{String(row.channel)}</span> : null}
                  </div>
                </div>
              </div>
              <p className="mt-3 line-clamp-6 flex-1 whitespace-pre-wrap text-[13.5px] leading-relaxed text-[var(--ink-2)]">{String(row.body ?? "")}</p>
              {row.tags ? <p className="mt-2 truncate text-[12px] text-[var(--muted)]">{String(row.tags)}</p> : null}
              <div className="mt-4 flex items-center gap-1.5 border-t border-[var(--line)] pt-3">
                <button className="btn btn-sm btn-primary" onClick={() => copy(row)}>
                  <Copy size={14} /> Salin
                </button>
                <button className="btn btn-sm btn-ghost" onClick={() => setEditing(row)} aria-label="Edit">
                  <Pencil size={14} />
                </button>
                <button className="btn btn-sm btn-ghost" onClick={() => remove(row)} aria-label="Hapus">
                  <Trash2 size={14} />
                </button>
                <span className="ml-auto text-[12px] text-[var(--muted)]">Dipakai {Number(row.uses ?? 0)}×</span>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <Empty text={data?.rows.length ? "Tidak ada template yang cocok" : "Belum ada template — klik “Template baru” untuk mulai"} />
      )}

      {editing !== undefined && <ResourceForm resource={r} row={editing} defaults={kind ? { kind } : undefined} onClose={() => setEditing(undefined)} onSaved={() => (setEditing(undefined), setTick((x) => x + 1))} />}
    </div>
  );
}
