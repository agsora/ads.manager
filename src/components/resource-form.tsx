"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { Field, Resource, Row } from "@/lib/resources";
import { api, useMeta, useToast } from "./providers";
import { FileAttachments } from "./file-attachments";
import { todayISO } from "@/lib/format";

/** Dialog. "drawer" slides in from the right (forms), "center" is a classic modal (details, imports). */
export function Modal({ title, subtitle, onClose, children, wide, variant = "center" }: { title: string; subtitle?: string; onClose: () => void; children: React.ReactNode; wide?: boolean; variant?: "center" | "drawer" }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const head = (
    <div className="flex items-start justify-between gap-4 border-b border-[var(--line)] px-6 py-5">
      <div className="min-w-0">
        <h2 className="serif text-[22px] leading-tight">{title}</h2>
        {subtitle && <p className="mt-1 text-[13px] text-[var(--muted)]">{subtitle}</p>}
      </div>
      <button className="btn btn-sm btn-ghost -mr-2 !px-2" onClick={onClose} aria-label="Tutup">
        <X size={18} />
      </button>
    </div>
  );

  if (typeof document === "undefined") return null;
  if (variant === "drawer")
    return createPortal(
      <div className="fixed inset-0 z-50 flex justify-end bg-[#1f1e1d]/25 backdrop-blur-[1.5px]" style={{ animation: "fade-in .15s ease" }} onMouseDown={onClose}>
        <div
          className={`flex h-full w-full ${wide ? "max-w-[780px]" : "max-w-[620px]"} flex-col bg-[var(--surface)] shadow-[-24px_0_60px_-20px_rgba(31,30,29,.35)]`}
          style={{ animation: "slide-in .24s cubic-bezier(.2,.8,.2,1)" }}
          onMouseDown={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label={title}
        >
          {head}
          <div className="drawer-body flex-1 overflow-y-auto px-6 pt-5">{children}</div>
        </div>
      </div>,
      document.body,
    );

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[#1f1e1d]/30 p-4 backdrop-blur-[1.5px] sm:p-10" style={{ animation: "fade-in .15s ease" }} onMouseDown={onClose}>
      <div
        className={`card w-full ${wide ? "max-w-4xl" : "max-w-2xl"} !shadow-[0_30px_80px_-24px_rgba(31,30,29,.45)]`}
        style={{ animation: "pop .18s cubic-bezier(.2,.8,.2,1)" }}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        {head}
        <div className="p-6">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

function toFormValue(f: Field, v: unknown) {
  if (v === null || v === undefined) return "";
  if (f.type === "percent") return String(Math.round(Number(v) * 10000) / 100);
  if (f.type === "date") return String(v).slice(0, 10);
  return String(v);
}

export function FieldInput({ f, value, onChange }: { f: Field; value: string; onChange: (v: string) => void }) {
  const { brands, options, users, campaigns } = useMeta();
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
  if (f.suggest === "users" || f.suggest === "campaigns")
    return (
      <>
        <input {...common} type="text" list={`dl-${f.key}`} autoComplete="off" />
        <datalist id={`dl-${f.key}`}>
          {(f.suggest === "users" ? users.map((u) => u.name) : campaigns).map((name) => (
            <option key={name} value={name} />
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

  const [pulling, setPulling] = useState(false);
  const link = resource.key === "content" ? vals.post_link || vals.brief_link : "";
  const pullMetrics = async () => {
    setPulling(true);
    try {
      const r = await api<{ ok: boolean; metrics: Record<string, number>; missing: string[]; message?: string }>("/api/content/metrics", "POST", { url: link });
      if (!r.ok) throw new Error(r.message ?? "Gagal membaca link");
      setVals((s) => ({ ...s, ...Object.fromEntries(Object.entries(r.metrics).map(([k, v]) => [k, String(v)])) }));
      toast(`Terisi: ${Object.keys(r.metrics).join(", ")}${r.missing.length ? ` · tidak tersedia: ${r.missing.join(", ")}` : ""}. Klik Simpan.`);
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setPulling(false);
    }
  };

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
    <Modal
      variant="drawer"
      title={title ?? `${row?.id ? "Edit" : "Tambah"} ${resource.singular}`}
      subtitle={row?.id ? String(row[resource.titleField] ?? "") || undefined : resource.description}
      onClose={onClose}
      wide={shown.length > 14}
    >
      <form onSubmit={submit}>
        {resource.key === "content" && shown.some((f) => f.key === "likes") && (
          <div className="mb-5 flex flex-wrap items-center gap-3 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] p-3">
            <div className="min-w-0 flex-1 text-[13px] text-[var(--ink-2)]">
              {link ? <>Link: <span className="break-all font-medium text-[var(--ink)]">{link}</span></> : "Isi Link Postingan dulu, lalu angka reach/views/like/comment/share/save bisa diambil otomatis."}
            </div>
            <button type="button" className="btn btn-sm" disabled={!link || pulling} onClick={pullMetrics}>
              {pulling ? "Membaca…" : "Ambil dari link"}
            </button>
          </div>
        )}
        {groups.map((g) => (
          <fieldset key={g} className="mb-4">
            {g && <legend className="mb-3 text-[12px] font-bold uppercase tracking-wider text-[var(--muted)]">{g}</legend>}
            <div className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2">
              {resource.fields
                .filter((f) => (f.group ?? "") === g)
                .map((f) => (
                  <div key={f.key} className={f.type === "longtext" ? "sm:col-span-2" : ""}>
                    <label className="label" htmlFor={`f-${f.key}`}>
                      {f.label} {f.required && <span className="text-[var(--critical)]">*</span>}
                    </label>
                    <FieldInput f={f} value={vals[f.key]} onChange={(v) => setVals((s) => ({ ...s, [f.key]: v }))} />
                  </div>
                ))}
            </div>
          </fieldset>
        ))}
        {row?.id && ["content", "influencers", "events"].includes(resource.key) && (!onlyGroups || onlyGroups.includes("Rencana")) && (
          <fieldset className="mb-4">
            <legend className="mb-3 text-[12px] font-bold uppercase tracking-wider text-[var(--muted)]">{resource.key === "content" ? "Desain & file (otomatis masuk folder Drive per campaign)" : "File di Drive"}</legend>
            <FileAttachments resource={resource.key} recordId={Number(row.id)} onChanged={onSaved} />
          </fieldset>
        )}
        <div className="sticky bottom-0 -mx-6 mt-6 flex justify-end gap-2 border-t border-[var(--line)] bg-[var(--surface)]/95 px-6 py-4 backdrop-blur">
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
