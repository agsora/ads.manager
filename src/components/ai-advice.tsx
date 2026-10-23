"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { api, useFilter, useToast } from "./providers";
import { fmtDate } from "@/lib/format";
import type { Advice, StoredAdvice } from "@/lib/ai-advice";

interface Status {
  configured: boolean;
  used: number;
  limit: number;
  last: StoredAdvice | null;
}

const FOCUS = [
  ["auto", "Otomatis (sudut pandang berganti)"],
  ["iklan", "Iklan"],
  ["leads", "Leads & akad"],
  ["konten", "Konten"],
  ["blast", "Blast & remarketing"],
  ["biaya", "Efisiensi biaya"],
] as const;

const PRIO: Record<string, string> = {
  tinggi: "border-[#e4b7ab] bg-[#fbefec] text-[var(--critical-ink)]",
  sedang: "border-[#ecd9a6] bg-[#fbf4df] text-[var(--warning-ink)]",
  rendah: "border-[var(--line)] bg-[var(--surface-2)] text-[var(--ink-2)]",
};

export function AiAdvice() {
  const f = useFilter();
  const toast = useToast();
  const [st, setSt] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [focus, setFocus] = useState<string>("auto");

  useEffect(() => {
    api<Status>("/api/ai/advice", "GET")
      .then(setSt)
      .catch(() => setSt(null));
  }, []);

  const generate = async () => {
    setBusy(true);
    try {
      const r = await api<{ last: StoredAdvice; used: number; limit: number }>("/api/ai/advice", "POST", {
        from: f.from,
        to: f.to,
        brand: f.brand || null,
        focus,
        previous: st?.last?.advice.saran.map((s) => s.judul) ?? [],
      });
      setSt((s) => (s ? { ...s, last: r.last, used: r.used, limit: r.limit } : s));
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(false);
    }
  };

  const last = st?.last ?? null;
  const advice: Advice | null = last?.advice ?? null;
  const samePeriod = last && last.period.from === f.from && last.period.to === f.to && (last.period.brand ?? "") === (f.brand ?? "");

  return (
    <section className="card p-5" aria-labelledby="ai-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent-ink)]">
              <Sparkles size={15} />
            </span>
            <h3 id="ai-title" className="serif text-[20px] leading-snug">
              Saran dari AI
            </h3>
          </div>
          <p className="mt-1 max-w-2xl text-[12.5px] leading-relaxed text-[var(--muted)]">
            AI membaca ringkasan angka periode ini dan memberi saran yang berbeda tiap kali dibuat, dan diperbarui otomatis setiap pagi. Saran dari aturan tetap di bawah tetap ada. Hanya angka ringkasan yang dikirim, tanpa nama atau nomor nasabah.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select className="input !h-9 !w-auto !text-[13px]" value={focus} onChange={(e) => setFocus(e.target.value)} aria-label="Fokus saran" disabled={busy}>
            {FOCUS.map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
          {st?.configured && (
            <button className="btn btn-primary" onClick={generate} disabled={busy}>
              {busy ? <Loader2 size={15} className="animate-spin" /> : advice ? <RefreshCw size={15} /> : <Sparkles size={15} />}
              {busy ? "AI sedang membaca data…" : advice ? "Buat ulang" : "Buat saran AI"}
            </button>
          )}
        </div>
      </div>

      {st && !st.configured && (
        <div className="mt-4 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] p-4 text-[13px] leading-relaxed text-[var(--ink-2)]">
          <b>Aktifkan saran AI otomatis (gratis):</b> admin membuat kunci gratis di{" "}
          <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-[var(--accent-ink)] underline">
            Google AI Studio <ExternalLink size={12} />
          </a>
          , lalu memasangnya di Vercel (<b>Settings → Environment Variables</b>) dengan nama <code>GEMINI_API_KEY</code> dan deploy ulang. Setelah itu saran muncul sendiri tiap pagi.
        </div>
      )}

      {busy && (
        <div className="mt-4 space-y-2" aria-busy="true">
          <div className="skel h-4 w-2/3" />
          <div className="skel h-24 w-full" />
          <p className="text-[12px] text-[var(--muted)]">Biasanya 20 sampai 40 detik.</p>
        </div>
      )}

      {advice && !busy && (
        <div className="mt-5 space-y-4">
          <p className="rounded-lg bg-[var(--surface-2)] p-4 text-[14px] leading-relaxed">{advice.ringkasan}</p>
          <ol className="space-y-3">
            {advice.saran.map((s, i) => (
              <li key={i} className="rounded-xl border border-[var(--line)] p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`chip ${PRIO[s.prioritas] ?? ""}`}>Prioritas {s.prioritas}</span>
                  <span className="chip">{s.area}</span>
                </div>
                <h4 className="mt-2 text-[15px] font-semibold leading-snug">{s.judul}</h4>
                <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--ink-2)]">
                  <b>Temuan:</b> {s.temuan}
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-[13.5px] leading-relaxed">
                  {s.langkah.map((l, k) => (
                    <li key={k}>{l}</li>
                  ))}
                </ul>
                <dl className="mt-3 grid gap-x-4 gap-y-1 text-[12.5px] sm:grid-cols-3">
                  <div>
                    <dt className="text-[var(--muted)]">Penanggung jawab</dt>
                    <dd>{s.pic}</dd>
                  </div>
                  <div>
                    <dt className="text-[var(--muted)]">Angka yang dipantau</dt>
                    <dd>{s.metrik}</dd>
                  </div>
                  <div>
                    <dt className="text-[var(--muted)]">Perkiraan dampak</dt>
                    <dd>{s.dampak}</dd>
                  </div>
                </dl>
              </li>
            ))}
          </ol>
          {advice.pertanyaan.length > 0 && (
            <div className="rounded-lg border border-dashed border-[var(--line)] p-4 text-[13px] leading-relaxed text-[var(--ink-2)]">
              <b>Data yang akan membuat saran lebih tepat:</b>
              <ul className="mt-1 list-disc pl-5">
                {advice.pertanyaan.map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-[12px] text-[var(--muted)]">
            Dibuat {new Date(last!.at).toLocaleString("id-ID")} untuk periode {fmtDate(last!.period.from)} – {fmtDate(last!.period.to)}
            {last!.period.brand ? ` · ${last!.period.brand}` : ""}
            {samePeriod ? "" : " (berbeda dari filter sekarang, klik Buat ulang untuk memperbarui)"} · Gemini · {st!.used}/{st!.limit} permintaan hari ini. Saran AI adalah masukan, periksa angkanya sebelum bertindak.
          </p>
        </div>
      )}
    </section>
  );
}
