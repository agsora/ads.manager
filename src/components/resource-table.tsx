"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Download, FileDown, Pencil, Plus, Search, Trash2, Upload } from "lucide-react";
import { RESOURCE_MAP, n, type Field, type Row } from "@/lib/resources";
import { api, useFetch, useFilter, useMeta, useToast } from "./providers";
import { ResourceForm } from "./resource-form";
import { ImportDialog } from "./import-dialog";
import { renderCell, renderComputed } from "./cells";
import { fmtMoney, fmtNum } from "@/lib/format";

const PAGE = 50;

export interface ResourceTableProps {
  resourceKey: string;
  /** select-field keys shown as quick filter dropdowns */
  quickFilters?: string[];
  /** which computed columns to show (default: all) */
  computedCols?: string[];
  /** ignore the global date range (e.g. KPI, settings-like data) */
  ignoreDate?: boolean;
  /** extra client-side filter */
  rowFilter?: (r: Row) => boolean;
  defaults?: Record<string, unknown>;
  onChanged?: () => void;
  toolbar?: React.ReactNode;
  /** extra buttons shown while rows are selected */
  selectionActions?: (ids: number[], done: () => void) => React.ReactNode;
  /** default platform offered by the import dialog */
  importPlatform?: string;
  /** remount key: change it to force a reload from outside */
  reloadKey?: number;
}

export function ResourceTable({ resourceKey, quickFilters = [], computedCols, ignoreDate, rowFilter, defaults, onChanged, toolbar, selectionActions, importPlatform, reloadKey = 0 }: ResourceTableProps) {
  const r = RESOURCE_MAP[resourceKey];
  const f = useFilter();
  const { options } = useMeta();
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [qf, setQf] = useState<Record<string, string>>({});
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const [page, setPage] = useState(1);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [editing, setEditing] = useState<Row | null | undefined>(undefined);
  const [importing, setImporting] = useState(false);
  const [allCols, setAllCols] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const params = new URLSearchParams();
  if (!ignoreDate) {
    params.set("from", f.from);
    params.set("to", f.to);
  }
  if (f.brand) params.set("brand", f.brand);
  if (debounced) params.set("q", debounced);
  const qs = params.toString();
  const { data, loading, error, reload } = useFetch<{ rows: Row[] }>(`/api/r/${resourceKey}?${qs}&_=${reloadKey}`);
  const refresh = () => {
    reload();
    onChanged?.();
  };

  const fields = r.fields.filter((x) => allCols || !x.hideInTable);
  const comps = (r.computed ?? []).filter((c) => !computedCols || computedCols.includes(c.key));

  const rows = useMemo(() => {
    let rs = data?.rows ?? [];
    for (const [k, v] of Object.entries(qf)) if (v) rs = rs.filter((x) => String(x[k] ?? "") === v);
    if (rowFilter) rs = rs.filter(rowFilter);
    if (sort) {
      const c = comps.find((x) => x.key === sort.key);
      const get = (x: Row) => (c ? c.fn(x) : x[sort.key]);
      rs = [...rs].sort((a, b) => {
        const va = get(a);
        const vb = get(b);
        if (va === vb) return 0;
        if (va === null || va === undefined || va === "") return 1;
        if (vb === null || vb === undefined || vb === "") return -1;
        return (typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb))) * sort.dir;
      });
    }
    return rs;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, qf, sort, rowFilter]);

  useEffect(() => setPage(1), [qs, qf]);
  const shown = rows.slice(0, page * PAGE);
  const numericFields = fields.filter((x) => ["money", "number"].includes(x.type) && !/budget|followers|daily/.test(x.key));

  const inlineUpdate = async (row: Row, field: Field, value: string) => {
    try {
      await api(`/api/r/${resourceKey}/${row.id}`, "PUT", { [field.key]: value || null });
      toast(`${field.label} diperbarui`);
      refresh();
    } catch (e) {
      toast((e as Error).message, "err");
    }
  };

  const bulkDelete = async () => {
    if (!sel.size || !confirm(`Hapus ${sel.size} data terpilih? Tindakan ini tidak bisa dibatalkan.`)) return;
    try {
      await api(`/api/r/${resourceKey}/delete`, "POST", { ids: [...sel] });
      toast(`${sel.size} data dihapus`);
      setSel(new Set());
      refresh();
    } catch (e) {
      toast((e as Error).message, "err");
    }
  };
  const delOne = async (row: Row) => {
    if (!confirm(`Hapus "${row[r.titleField] ?? r.singular}"?`)) return;
    await api(`/api/r/${resourceKey}/${row.id}`, "DELETE");
    toast("Data dihapus");
    refresh();
  };

  const exportUrl = (format: string) => `/api/export?resource=${resourceKey}&format=${format}&${qs}`;
  const th = (key: string, label: string, right?: boolean) => (
    <th className={right ? "text-right" : ""}>
      <button
        className="inline-flex items-center gap-1 hover:text-[var(--ink)]"
        onClick={() => setSort((s) => (s?.key === key ? (s.dir === -1 ? { key, dir: 1 } : null) : { key, dir: -1 }))}
      >
        {label}
        {sort?.key === key && (sort.dir === 1 ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
      </button>
    </th>
  );

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--line)] p-3">
        <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
          <input className="input !h-9 !pl-9 !text-[13px]" placeholder={`Cari ${r.singular.toLowerCase()}…`} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {quickFilters.map((k) => {
          const fd = r.fields.find((x) => x.key === k)!;
          const opts = options[fd.options ?? ""] ?? [];
          return (
            <select key={k} className="input !h-9 !w-auto !text-[13px]" value={qf[k] ?? ""} onChange={(e) => setQf((s) => ({ ...s, [k]: e.target.value }))} aria-label={fd.label}>
              <option value="">{fd.label}: semua</option>
              {opts.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          );
        })}
        {toolbar}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {sel.size > 0 &&
            selectionActions?.([...sel], () => {
              setSel(new Set());
              refresh();
            })}
          {sel.size > 0 && (
            <button className="btn btn-sm btn-danger" onClick={bulkDelete}>
              <Trash2 size={14} /> Hapus {sel.size}
            </button>
          )}
          <label className="flex items-center gap-1.5 text-[12.5px] text-[var(--ink-2)]">
            <input type="checkbox" checked={allCols} onChange={(e) => setAllCols(e.target.checked)} /> Semua kolom
          </label>
          <a className="btn btn-sm" href={`/api/template?resource=${resourceKey}`} title="Unduh template Excel">
            <FileDown size={14} /> Template
          </a>
          <button className="btn btn-sm" onClick={() => setImporting(true)}>
            <Upload size={14} /> Impor
          </button>
          <a className="btn btn-sm" href={exportUrl("xlsx")}>
            <Download size={14} /> Excel
          </a>
          <a className="btn btn-sm" href={exportUrl("csv")}>
            CSV
          </a>
          <button className="btn btn-sm btn-accent" onClick={() => setEditing(null)}>
            <Plus size={14} /> Tambah
          </button>
        </div>
      </div>

      <div className="max-h-[68vh] overflow-auto">
        <table className="data">
          <thead>
            <tr>
              <th className="w-8">
                <input
                  type="checkbox"
                  aria-label="Pilih semua"
                  checked={shown.length > 0 && shown.every((x) => sel.has(x.id!))}
                  onChange={(e) => setSel(e.target.checked ? new Set(shown.map((x) => x.id!)) : new Set())}
                />
              </th>
              {fields.map((x) => th(x.key, x.label, ["money", "number", "percent"].includes(x.type)))}
              {comps.map((c) => th(c.key, c.label, c.format !== "text"))}
              <th className="w-20" />
            </tr>
          </thead>
          <tbody>
            {loading && !data && (
              <tr>
                <td colSpan={fields.length + comps.length + 2} className="py-10 text-center text-[var(--muted)]">
                  Memuat data…
                </td>
              </tr>
            )}
            {error && (
              <tr>
                <td colSpan={fields.length + comps.length + 2} className="py-10 text-center text-[var(--critical)]">
                  {error}
                </td>
              </tr>
            )}
            {data && rows.length === 0 && (
              <tr>
                <td colSpan={fields.length + comps.length + 2} className="py-12 text-center text-[var(--muted)]">
                  Belum ada data di periode/filter ini. Klik <b>Tambah</b> atau <b>Impor</b> dari Excel.
                </td>
              </tr>
            )}
            {shown.map((row) => (
              <tr key={row.id} className="cursor-pointer" onClick={() => setEditing(row)}>
                <td onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    aria-label="Pilih baris"
                    checked={sel.has(row.id!)}
                    onChange={(e) =>
                      setSel((s) => {
                        const nx = new Set(s);
                        if (e.target.checked) nx.add(row.id!);
                        else nx.delete(row.id!);
                        return nx;
                      })
                    }
                  />
                </td>
                {fields.map((fd) => (
                  <td key={fd.key} className={["money", "number", "percent"].includes(fd.type) ? "text-right" : ""}>
                    {fd.type === "select" ? (
                      <InlineSelect value={String(row[fd.key] ?? "")} opts={options[fd.options ?? ""] ?? []} onChange={(v) => inlineUpdate(row, fd, v)} />
                    ) : (
                      renderCell(fd, row[fd.key])
                    )}
                  </td>
                ))}
                {comps.map((c) => (
                  <td key={c.key} className={c.format !== "text" ? "text-right" : ""}>
                    {renderComputed(c.format, c.fn(row))}
                  </td>
                ))}
                <td onClick={(e) => e.stopPropagation()}>
                  <div className="flex justify-end gap-1">
                    <button className="btn btn-sm btn-ghost !px-1.5" onClick={() => setEditing(row)} aria-label="Edit">
                      <Pencil size={14} />
                    </button>
                    <button className="btn btn-sm btn-ghost btn-danger !px-1.5" onClick={() => delOne(row)} aria-label="Hapus">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && numericFields.length > 0 && (
            <tfoot>
              <tr className="bg-[var(--surface-2)] font-semibold">
                <td />
                {fields.map((fd, i) => (
                  <td key={fd.key} className={`border-t border-[var(--line)] ${["money", "number", "percent"].includes(fd.type) ? "text-right tnum" : ""}`}>
                    {i === 0 ? `Total (${fmtNum(rows.length)})` : numericFields.includes(fd) ? (fd.type === "money" ? fmtMoney(rows.reduce((s, x) => s + n(x[fd.key]), 0)) : fmtNum(rows.reduce((s, x) => s + n(x[fd.key]), 0))) : ""}
                  </td>
                ))}
                {comps.map((c) => (
                  <td key={c.key} className="border-t border-[var(--line)]" />
                ))}
                <td className="border-t border-[var(--line)]" />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {rows.length > shown.length && (
        <div className="border-t border-[var(--line)] p-3 text-center">
          <button className="btn btn-sm" onClick={() => setPage((p) => p + 1)}>
            Tampilkan lebih banyak ({fmtNum(rows.length - shown.length)} lagi)
          </button>
        </div>
      )}

      {editing !== undefined && <ResourceForm resource={r} row={editing} defaults={defaults} onClose={() => setEditing(undefined)} onSaved={refresh} />}
      {importing && <ImportDialog resourceKey={resourceKey} defaultPlatform={importPlatform} onClose={() => setImporting(false)} onDone={refresh} />}
    </div>
  );
}

function InlineSelect({ value, opts, onChange }: { value: string; opts: string[]; onChange: (v: string) => void }) {
  const all = value && !opts.includes(value) ? [...opts, value] : opts;
  return (
    <span onClick={(e) => e.stopPropagation()} className="relative inline-block">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 cursor-pointer opacity-0"
        aria-label="Ubah nilai"
      >
        <option value="">–</option>
        {all.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
      {renderCell({ type: "select", key: "" }, value || null)}
    </span>
  );
}
