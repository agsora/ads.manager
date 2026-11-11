"use client";

import { useState } from "react";
import { FieldInput, Modal } from "./resource-form";
import { api, useToast } from "./providers";
import { RESOURCE_MAP, type Row } from "@/lib/resources";
import { KPI_SOURCES, LEGACY_KPI_FIELDS, validateKpi } from "@/lib/kpi-engine";
import { monthStart, todayISO } from "@/lib/format";

export function KpiForm({ row, defaults, onClose, onSaved }: { row?: Row | null; defaults?: Record<string, unknown>; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const legacy = !!row?.id && !row.metric_source;
  const [saving, setSaving] = useState(false);
  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial = { period: monthStart(todayISO()), metric_source: "posted", metric_unit: "number", direction: "higher", weight: "", manual_mode: "value", ...defaults, ...row };
    return Object.fromEntries(RESOURCE_MAP.kpi.fields.map((f) => {
      const v = (initial as Row)[f.key];
      return [f.key, v === null || v === undefined ? "" : f.type === "percent" ? String(Number(v) * 100) : f.type === "date" ? String(v).slice(0, 10) : String(v)];
    }));
  });
  const [indicators, setIndicators] = useState<string[]>(() => Object.keys(LEGACY_KPI_FIELDS).filter((k) => row?.[k] !== null && row?.[k] !== undefined && row?.[k] !== ""));
  const set = (key: string, value: string) => setValues((v) => ({ ...v, [key]: value }));
  const source = KPI_SOURCES[values.metric_source] || KPI_SOURCES.posted;
  const manual = values.metric_source === "manual";
  const fields = ["title", "period", "brand", "kpi_category", "pic", "branch", ...((legacy || source.family === "content" || manual) ? ["content_category", "content_type"] : [])];
  const render = (key: string) => {
    const f = RESOURCE_MAP.kpi.fields.find((x) => x.key === key)!;
    return <div key={key}><label className="label" htmlFor={`f-${key}`}>{f.label}{f.required ? " *" : ""}</label><FieldInput f={f} value={values[key] || ""} onChange={(v) => set(key, v)} /></div>;
  };
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const body: Row = {};
    // Send explicit nulls for fields removed from the form so edits cannot retain hidden targets.
    for (const f of RESOURCE_MAP.kpi.fields) body[f.key] = null;
    for (const key of [...fields, "weight", "mandatory", "notes"]) body[key] = values[key] || null;
    if (legacy) {
      for (const key of indicators) body[key] = values[key] || null;
      if (!indicators.some((k) => Number(values[k]) > 0)) return toast("Isi minimal satu indikator target", "err");
    } else {
      for (const key of ["metric_source", "metric_unit", "target_value", "direction"]) body[key] = values[key] || null;
      if (manual) {
        body.manual_mode = values.metric_unit === "percent" ? values.manual_mode || "value" : "value";
        for (const key of body.manual_mode === "ratio" ? ["actual_numerator", "actual_denominator"] : ["actual_value"]) body[key] = values[key] === "" ? null : values[key];
      }
      const error = validateKpi(body);
      if (error) return toast(error, "err");
    }
    setSaving(true);
    try {
      await api(row?.id ? `/api/r/kpi/${row.id}` : "/api/r/kpi", row?.id ? "PUT" : "POST", body);
      toast("KPI disimpan"); onSaved(); onClose();
    } catch (e) { toast((e as Error).message, "err"); }
    finally { setSaving(false); }
  };
  return (
    <Modal variant="drawer" title={`${row?.id ? "Edit" : "Tambah"} KPI`} subtitle="Pilih indikator yang ingin diukur. Setelah disimpan, hanya informasi yang diisi yang ditampilkan." onClose={onClose}>
      <form onSubmit={save} className="space-y-5">
        <fieldset><legend className="label mb-3">Identitas & tanggung jawab</legend><div className="grid gap-3 sm:grid-cols-2">{fields.map(render)}</div></fieldset>
        <fieldset className="space-y-3"><legend className="label mb-2">Ukuran keberhasilan</legend>
          {legacy ? <>
            <p className="text-xs text-[var(--muted)]">KPI ini memiliki beberapa indikator dengan bobot sama di dalam satu KPI. Centang hanya yang diperlukan; indikator yang dilepas akan dihapus dari target ini.</p>
            {Object.entries(LEGACY_KPI_FIELDS).map(([key, spec]) => <div key={key} className="rounded-lg border border-[var(--grid)] p-3"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={indicators.includes(key)} onChange={(e) => setIndicators((xs) => e.target.checked ? [...xs, key] : xs.filter((x) => x !== key))} />{spec.label}</label>{indicators.includes(key) && <div className="mt-2">{render(key)}</div>}</div>)}
          </> : <>
            <label className="label" htmlFor="kpi-source">Indikator *</label>
            <select id="kpi-source" className="input" value={values.metric_source} onChange={(e) => setValues((v) => ({ ...v, metric_source: e.target.value, metric_unit: KPI_SOURCES[e.target.value].unit, target_value: "", actual_value: "", actual_numerator: "", actual_denominator: "", manual_mode: "value", direction: "higher" }))}>{Object.entries(KPI_SOURCES).map(([key, s]) => <option key={key} value={key}>{s.label}</option>)}</select>
            <p className="text-xs text-[var(--muted)]">{source.description}</p>
            <div className="grid gap-3 sm:grid-cols-2"><div><label className="label" htmlFor="kpi-unit">Satuan</label><select id="kpi-unit" className="input" disabled={!manual} value={values.metric_unit} onChange={(e) => setValues((v) => ({ ...v, metric_unit: e.target.value, actual_value: "", actual_numerator: "", actual_denominator: "", manual_mode: "value" }))}>{Object.entries({ number: "Jumlah", percent: "Persen (%)", money: "Rupiah", rating: "Rating (0–5)" }).map(([k, label]) => <option key={k} value={k}>{label}</option>)}</select></div><div><label className="label" htmlFor="kpi-direction">Arah target</label><select id="kpi-direction" className="input" value={values.direction} onChange={(e) => set("direction", e.target.value)}><option value="higher">Minimal — semakin tinggi semakin baik</option><option value="lower">Maksimal — semakin rendah semakin baik</option></select></div></div>
            <div><label className="label" htmlFor="kpi-target">Target {values.metric_unit === "percent" ? "(isi 90 untuk 90%)" : ""} *</label><input id="kpi-target" className="input" type="number" min="0" step="any" required value={values.target_value} onChange={(e) => set("target_value", e.target.value)} /></div>
            {manual && <div className="space-y-3 rounded-lg bg-[var(--surface-2)] p-3">
              {values.metric_unit === "percent" && <><label className="label" htmlFor="kpi-manual-mode">Cara menghitung aktual</label><select id="kpi-manual-mode" className="input" value={values.manual_mode || "value"} onChange={(e) => set("manual_mode", e.target.value)}><option value="value">Isi persentase langsung</option><option value="ratio">Jumlah berhasil ÷ jumlah keseluruhan</option></select></>}
              {values.metric_unit === "percent" && values.manual_mode === "ratio" ? <><div className="grid gap-3 sm:grid-cols-2">{render("actual_numerator")}{render("actual_denominator")}</div><p className="text-xs">Aktual: {Number(values.actual_denominator) > 0 && values.actual_numerator !== "" ? `${(Number(values.actual_numerator) / Number(values.actual_denominator) * 100).toFixed(2)}%` : "Belum ada data"}</p></> : render("actual_value")}
              <p className="text-xs text-[var(--muted)]">Aktual boleh dikosongkan sampai hasil tersedia. Nilai 0 tetap dihitung sebagai hasil yang sudah diisi.</p>
            </div>}
          </>}
        </fieldset>
        <details><summary className="cursor-pointer text-sm font-medium">Penilaian & catatan (opsional)</summary><div className="mt-3 space-y-3">{render("weight")}<p className="text-xs text-[var(--muted)]">Bobot relatif, misalnya 50, 30, dan 20. Skor tiap KPI dibatasi 100%.</p><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={values.mandatory === "Ya"} onChange={(e) => set("mandatory", e.target.checked ? "Ya" : "")} />KPI wajib — tandai jika belum tercapai meski skor total tinggi</label>{render("notes")}</div></details>
        <div className="sticky bottom-0 -mx-6 flex justify-end gap-2 border-t border-[var(--line)] bg-[var(--surface)] px-6 py-4"><button type="button" className="btn" onClick={onClose}>Batal</button><button className="btn btn-accent" disabled={saving}>{saving ? "Menyimpan…" : "Simpan KPI"}</button></div>
      </form>
    </Modal>
  );
}
