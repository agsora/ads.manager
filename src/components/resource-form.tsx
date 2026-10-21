"use client";

import { useState } from "react";
import { X } from "lucide-react";
import type { Field, Resource, Row } from "@/lib/resources";
import { api, useMeta, useToast } from "./providers";
import { todayISO } from "@/lib/format";

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 sm:p-8" onMouseDown={onClose}>
      <div className={`card w-full ${wide ? "max-w-4xl" : "max-w-2xl"} shadow-2xl`} onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
        <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-4">
          <h2 className="text-base font-bold">{title}</h2>
          <button className="btn btn-sm btn-ghost" onClick={onClose} aria-label="Tutup">
            <X size={16} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function toFormValue(f: Field, v: unknown) {
  if (v === null || v === undefined) return "";
  if (f.type === "percent") return String(Math.round(Number(v) * 10000) / 100);
  if (f.type === "date") return String(v).slice(0, 10);
  return String(v);
}

export function FieldInput({ f, value, onChange }: { f: Field; value: string; onChange: (v: string) => void }) {
  const { brands, options, users } = useMeta();
  const common = { id: `f-${f.key}`, className: "input", value, onChange: (e: { target: { value: string } }) => onChange(e.target.value) };
  if (f.type === "brand" || f.type === "select") {
    const list = f.type === "brand" ? brands.map((b) => b.name) : options[f.options ?? ""] ?? [];
    const all = value && !list.includes(value) ? [...list, value] : list;
    return (
      <select {...common}>
        <option value="">— pilih —</option>
        {all.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  }
  if (f.type === "longtext") return <textarea {...common} rows={3} />;
  if (f.type === "date") return <input {...common} type="date" />;
  if (f.type === "time") return <input {...common} type="time" />;
  if (f.type === "rating") return <input {...common} type="number" min={1} max={5} step={0.5} />;
  if (["number", "money", "percent"].includes(f.type))
    return <input {...common} type="number" step="any" inputMode="decimal" placeholder={f.type === "money" ? "Rp" : f.type === "percent" ? "%" : ""} />;
  if (f.type === "url") return <input {...common} type="url" placeholder="https://" />;
  if (f.suggest === "users")
    return (
      <>
        <input {...common} type="text" list={`dl-${f.key}`} autoComplete="off" />
        <datalist id={`dl-${f.key}`}>
          {users.map((u) => (
            <option key={u.id} value={u.name} />
          ))}
        </datalist>
      </>
    );
  return <input {...common} type={f.type === "phone" ? "tel" : "text"} />;
}

export function ResourceForm({ resource, row, onClose, onSaved, defaults, groups: onlyGroups, title }: { resource: Resource; row?: Row | null; onClose: () => void; onSaved: () => void; defaults?: Record<string, unknown>; groups?: string[]; title?: string }) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [vals, setVals] = useState<Record<string, string>>(() => {
    const o: Record<string, string> = {};
    for (const f of resource.fields) {
      const base = row ? row[f.key] : defaults?.[f.key] ?? (f.key === resource.dateField ? todayISO() : null);
      o[f.key] = toFormValue(f, base);
    }
    return o;
  });
  const groups = [...new Set(resource.fields.map((f) => f.group ?? ""))].filter((g) => !onlyGroups || onlyGroups.includes(g));
  const shown = resource.fields.filter((f) => groups.includes(f.group ?? ""));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const body: Record<string, unknown> = {};
      // only send the visible part of the record, so editing results never overwrites the plan (and vice versa)
      for (const f of row?.id ? shown : resource.fields) body[f.key] = vals[f.key] === "" ? null : vals[f.key];
      if (row?.id) await api(`/api/r/${resource.key}/${row.id}`, "PUT", body);
      else await api(`/api/r/${resource.key}`, "POST", body);
      toast(row?.id ? "Perubahan disimpan" : `${resource.singular} ditambahkan`);
      onSaved();
      onClose();
    } catch (err) {
      toast((err as Error).message, "err");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={title ?? `${row?.id ? "Edit" : "Tambah"} ${resource.singular}`} onClose={onClose} wide={shown.length > 12}>
      <form onSubmit={submit}>
        {groups.map((g) => (
          <fieldset key={g} className="mb-4">
            {g && <legend className="mb-3 text-[12px] font-bold uppercase tracking-wider text-[var(--muted)]">{g}</legend>}
            <div className="grid grid-cols-1 gap-x-4 gap-y-3.5 sm:grid-cols-2 lg:grid-cols-3">
              {resource.fields
                .filter((f) => (f.group ?? "") === g)
                .map((f) => (
                  <div key={f.key} className={f.type === "longtext" ? "sm:col-span-2 lg:col-span-3" : ""}>
                    <label className="label" htmlFor={`f-${f.key}`}>
                      {f.label} {f.required && <span className="text-[var(--critical)]">*</span>}
                    </label>
                    <FieldInput f={f} value={vals[f.key]} onChange={(v) => setVals((s) => ({ ...s, [f.key]: v }))} />
                  </div>
                ))}
            </div>
          </fieldset>
        ))}
        <div className="mt-5 flex justify-end gap-2 border-t border-[var(--line)] pt-4">
          <button type="button" className="btn" onClick={onClose}>
            Batal
          </button>
          <button className="btn btn-accent" disabled={saving}>
            {saving ? "Menyimpan…" : "Simpan"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
