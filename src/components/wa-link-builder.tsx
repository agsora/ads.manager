"use client";

import { useEffect, useState } from "react";
import { Check, ChevronDown, Copy, ExternalLink, Link2 } from "lucide-react";
import { useMeta, useToast } from "./providers";

/** Builds a wa.me link whose first message carries a campaign code, so leads can be traced back to the ad. */
export function WaLinkBuilder() {
  const { campaigns } = useMeta();
  const toast = useToast();
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState("Halo, saya tertarik dengan penawaran ini");
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      setPhone(localStorage.getItem("am_wa_phone") ?? "");
    } catch {
      /* ignore */
    }
  }, []);
  const digits = phone.replace(/\D/g, "").replace(/^0/, "62");
  const text = `${msg.trim()}${code.trim() ? ` [ref: ${code.trim()}]` : ""}`;
  const link = digits ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}` : "";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast("Salin manual dari kotak link", "err");
    }
  };

  return (
    <section className="card">
      <button className="flex w-full items-center gap-3 px-5 py-3.5 text-left" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent-ink)]">
          <Link2 size={16} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="serif block text-[18px] leading-snug">Pembuat link WhatsApp bertanda campaign</span>
          <span className="block text-[12.5px] text-[var(--muted)]">Pasang di tombol WhatsApp iklan agar leads bisa dilacak ke campaign asalnya</span>
        </span>
        <ChevronDown size={18} className={`shrink-0 text-[var(--muted)] transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
      <div className="border-t border-[var(--line)] p-5">
      <div className="grid gap-3 md:grid-cols-3">
        <div>
          <label className="label" htmlFor="wa-phone">Nomor WhatsApp tujuan</label>
          <input
            id="wa-phone"
            className="input"
            placeholder="0812xxxxxxx"
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value);
              try {
                localStorage.setItem("am_wa_phone", e.target.value);
              } catch {
                /* ignore */
              }
            }}
          />
        </div>
        <div>
          <label className="label" htmlFor="wa-code">Kode campaign</label>
          <input id="wa-code" className="input" list="wa-code-list" placeholder="pilih / ketik nama campaign" value={code} onChange={(e) => setCode(e.target.value)} />
          <datalist id="wa-code-list">
            {campaigns.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
        <div>
          <label className="label" htmlFor="wa-msg">Pesan pembuka</label>
          <input id="wa-msg" className="input" value={msg} onChange={(e) => setMsg(e.target.value)} />
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input className="input min-w-0 flex-1 !text-[12.5px]" readOnly value={link || "Isi nomor WhatsApp untuk membuat link"} aria-label="Link hasil" onFocus={(e) => e.currentTarget.select()} />
        <button className="btn" disabled={!link} onClick={copy}>
          {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? "Tersalin" : "Salin"}
        </button>
        <a className={`btn ${link ? "" : "pointer-events-none opacity-50"}`} href={link || undefined} target="_blank" rel="noreferrer">
          <ExternalLink size={15} /> Tes
        </a>
      </div>
      <p className="mt-3 text-[12px] leading-relaxed text-[var(--muted)]">
        Setelah chat masuk, CS menyalin kode dari pesan ke kolom <b>Kode Campaign</b> di WA Leads — atau menulis <code>[ref: kode]</code> di kolom Kebutuhan dan kode terisi otomatis. Dari situ laporan menghitung leads, deal, biaya per lead, dan ROAS per campaign.
      </p>
      </div>
      )}
    </section>
  );
}
