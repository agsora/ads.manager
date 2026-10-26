"use client";

import { useEffect, useMemo, useState } from "react";
import { Copy, ExternalLink } from "lucide-react";
import { PageHeader } from "@/components/shell";
import { useToast } from "@/components/providers";
import { Card } from "@/components/charts";
import { ComplianceHint } from "@/components/field-hints";
import { fmtMoney, fmtPct } from "@/lib/format";

const TENORS = [12, 18, 24, 30, 36, 48];
const KEY = "am_simulasi";

/** Monthly effective rate that makes the net amount received equal the present value of all instalments. */
function monthlyRate(net: number, pmt: number, months: number): number | null {
  if (net <= 0 || pmt * months <= net) return 0;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    const pv = (pmt * (1 - Math.pow(1 + mid, -months))) / mid;
    if (pv > net) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export default function SimulasiPage() {
  const toast = useToast();
  const [plafon, setPlafon] = useState("20000000");
  const [flat, setFlat] = useState("");
  const [admin, setAdmin] = useState("");
  const [tenors, setTenors] = useState<number[]>([12, 24, 36]);
  const [phone, setPhone] = useState("");
  const [ref, setRef] = useState("");

  useEffect(() => {
    try {
      const j = JSON.parse(localStorage.getItem(KEY) ?? "{}");
      if (j.flat) setFlat(j.flat);
      if (j.admin) setAdmin(j.admin);
      if (j.phone) setPhone(j.phone);
    } catch {
      /* optional */
    }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ flat, admin, phone }));
    } catch {
      /* optional */
    }
  }, [flat, admin, phone]);

  const P = Number(plafon.replace(/\D/g, "")) || 0;
  const rate = Number(flat.replace(",", ".")) || 0; // flat % per year
  const adminPct = Number(admin.replace(",", ".")) || 0;

  const rows = useMemo(
    () =>
      tenors
        .slice()
        .sort((a, b) => a - b)
        .map((m) => {
          const interest = (P * (rate / 100) * m) / 12;
          const pmt = m ? (P + interest) / m : 0;
          const net = P - (P * adminPct) / 100;
          const r = rate > 0 ? monthlyRate(net, pmt, m) : 0;
          return { m, pmt, total: pmt * m, interest, net, eff: r === null ? null : Math.pow(1 + r, 12) - 1 };
        }),
    [P, rate, adminPct, tenors],
  );

  const digits = phone.replace(/\D/g, "").replace(/^0/, "62");
  const text =
    `Simulasi pembiayaan (perkiraan, bukan penawaran mengikat)\nPlafon: ${fmtMoney(P)}\n` +
    rows.map((r) => `• ${r.m} bulan: ${fmtMoney(Math.round(r.pmt))}/bulan`).join("\n") +
    `\nBunga flat ${rate || "…"}% per tahun${adminPct ? `, biaya administrasi ${adminPct}%` : ""}. Besaran akhir mengikuti hasil analisis kredit. Syarat dan ketentuan berlaku. Perusahaan terdaftar dan diawasi OJK.` +
    (ref.trim() ? ` [ref: ${ref.trim()}]` : "");
  const link = digits ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}` : "";
  const toggle = (m: number) => setTenors((t) => (t.includes(m) ? t.filter((x) => x !== m) : [...t, m]));

  return (
    <div className="space-y-4">
      <PageHeader eyebrow="WhatsApp" title="Simulasi Cicilan" desc="Hitung perkiraan angsuran untuk calon nasabah dan bagikan lewat WhatsApp dengan kode campaign. Isi bunga dan biaya sesuai ketentuan produk yang berlaku; hasilnya hanya perkiraan dan selalu disertai keterangan bahwa keputusan mengikuti analisis kredit." />

      <div className="grid gap-4 lg:grid-cols-[2fr_3fr]">
        <Card title="Parameter">
          <div className="space-y-4">
            <div>
              <label className="label" htmlFor="sim-p">Plafon pembiayaan (Rp)</label>
              <input id="sim-p" className="input" inputMode="numeric" value={P ? P.toLocaleString("id-ID") : ""} onChange={(e) => setPlafon(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label" htmlFor="sim-f">Bunga flat per tahun (%)</label>
                <input id="sim-f" className="input" inputMode="decimal" placeholder="isi sesuai produk" value={flat} onChange={(e) => setFlat(e.target.value)} />
              </div>
              <div>
                <label className="label" htmlFor="sim-a">Biaya administrasi (%)</label>
                <input id="sim-a" className="input" inputMode="decimal" placeholder="0" value={admin} onChange={(e) => setAdmin(e.target.value)} />
              </div>
            </div>
            <div>
              <div className="label">Tenor</div>
              <div className="flex flex-wrap gap-1.5">
                {TENORS.map((m) => (
                  <button key={m} type="button" className="pill" data-on={tenors.includes(m)} style={tenors.includes(m) ? { borderColor: "var(--ink)", background: "var(--surface-2)" } : undefined} onClick={() => toggle(m)} aria-pressed={tenors.includes(m)}>
                    {m} bln
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Card>

        <Card title="Hasil perkiraan" subtitle="Bunga efektif dihitung dari dana yang benar-benar diterima, supaya sama dengan yang diwajibkan untuk diinformasikan">
          {rate > 0 ? (
            <div className="-mx-4 overflow-x-auto">
              <table className="data">
                <thead>
                  <tr>
                    <th>Tenor</th>
                    <th className="num">Angsuran / bulan</th>
                    <th className="num">Total bunga</th>
                    <th className="num">Total bayar</th>
                    <th className="num">Dana diterima</th>
                    <th className="num">Bunga efektif / tahun</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.m}>
                      <td>{r.m} bulan</td>
                      <td className="num font-semibold">{fmtMoney(Math.round(r.pmt))}</td>
                      <td className="num">{fmtMoney(Math.round(r.interest))}</td>
                      <td className="num">{fmtMoney(Math.round(r.total))}</td>
                      <td className="num">{fmtMoney(Math.round(r.net))}</td>
                      <td className="num">{fmtPct(r.eff, 1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="py-6 text-center text-[13.5px] text-[var(--muted)]">Isi bunga flat per tahun untuk melihat hasil. Angka bunga tidak diisi otomatis karena mengikuti ketentuan produk.</p>
          )}
        </Card>
      </div>

      <Card title="Bagikan lewat WhatsApp" subtitle="Pesan sudah memuat keterangan syarat dan ketentuan serta status pengawasan OJK">
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3">
            <div>
              <label className="label" htmlFor="sim-w">Nomor WhatsApp tujuan (nasabah)</label>
              <input id="sim-w" className="input" inputMode="tel" placeholder="0812…" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="sim-r">Kode campaign (opsional)</label>
              <input id="sim-r" className="input" placeholder="mis. gajian-okt" value={ref} onChange={(e) => setRef(e.target.value)} />
              <p className="mt-1 text-[12px] text-[var(--muted)]">Kode ikut terkirim di pesan sehingga lead tercatat ke campaign asalnya.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                className="btn"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(text);
                    toast("Pesan disalin");
                  } catch {
                    toast("Salin manual dari kotak pesan", "err");
                  }
                }}
              >
                <Copy size={14} /> Salin pesan
              </button>
              {link && (
                <a className="btn btn-primary" href={link} target="_blank" rel="noreferrer">
                  <ExternalLink size={14} /> Buka di WhatsApp
                </a>
              )}
            </div>
          </div>
          <div>
            <div className="label">Pratinjau pesan</div>
            <div className="rounded-xl border border-[var(--line)] bg-[#efe9dc] p-4">
              <div className="whitespace-pre-wrap rounded-lg rounded-tl-none bg-white px-3 py-2 text-[13.5px] leading-relaxed shadow-[0_1px_1px_rgba(0,0,0,.06)]">{text}</div>
            </div>
            <ComplianceHint text={text} />
          </div>
        </div>
      </Card>
    </div>
  );
}
