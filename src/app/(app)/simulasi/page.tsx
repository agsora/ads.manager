"use client";

import { useEffect, useMemo, useState } from "react";
import { Copy, ExternalLink } from "lucide-react";
import { PageHeader } from "@/components/shell";
import { useToast } from "@/components/providers";
import { Card } from "@/components/charts";
import { ComplianceHint } from "@/components/field-hints";
import { fmtMoney, fmtPct } from "@/lib/format";
import {
  CAR_ADM,
  CAR_LOAN_RANGE,
  CAR_STEP,
  CAR_TENORS,
  DATUN_PERIOD,
  MOTOR_ADM,
  MOTOR_LOAN_RANGE,
  MOTOR_STEP,
  MOTOR_TENORS,
  carBrands,
  carFamilies,
  carMaxLoan,
  carOtr,
  carQuote,
  carTypes,
  carYearsFor,
  motorBrands,
  motorMaxLoan,
  motorOtr,
  motorQuote,
  motorTypes,
  motorYearsFor,
  snapCarLoan,
  snapMotorLoan,
  type CarKind,
  type Quote,
} from "@/lib/datun";

const KEY = "am_simulasi_datun";
type Mode = "mobil" | "motor";

/** The saved/selected value if it is still offered, otherwise the first option. */
const pick = <T,>(value: T | undefined, options: T[]): T | undefined => (value !== undefined && options.includes(value) ? value : options[0]);
const digits = (s: string) => Number(s.replace(/\D/g, "")) || 0;

function Choice({ label, value, options, onChange, id }: { label: string; value: string | number | undefined; options: (string | number)[]; onChange: (v: string) => void; id: string }) {
  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <select id={id} className="input" value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}

function Seg<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { v: T; t: string }[]; onChange: (v: T) => void }) {
  return (
    <div>
      <div className="label">{label}</div>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button key={o.v} type="button" className="pill" aria-pressed={value === o.v} style={value === o.v ? { borderColor: "var(--ink)", background: "var(--surface-2)" } : undefined} onClick={() => onChange(o.v)}>
            {o.t}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function SimulasiPage() {
  const toast = useToast();
  const [mode, setMode] = useState<Mode>("mobil");
  // mobil (R4)
  const [kind, setKind] = useState<CarKind>("PASSANGER");
  const [ro, setRo] = useState(false);
  const [mahal, setMahal] = useState(false);
  const [brand, setBrand] = useState("DAIHATSU");
  const [family, setFamily] = useState("TERIOS");
  const [type, setType] = useState("NEW TERIOS 1.5 R MT");
  const [year, setYear] = useState(2022);
  const [loan, setLoan] = useState("35000000");
  // motor (R2)
  const [mRo, setMRo] = useState(true);
  const [mBrand, setMBrand] = useState("YAMAHA");
  const [mType, setMType] = useState("N MAX TURBO");
  const [mYear, setMYear] = useState(2026);
  const [mLoan, setMLoan] = useState("15000000");
  // both
  const [otrManual, setOtrManual] = useState("");
  const [ltv, setLtv] = useState("80");
  const [share, setShare] = useState<number[]>([12, 24, 36]);
  const [phone, setPhone] = useState("");
  const [ref, setRef] = useState("");

  useEffect(() => {
    try {
      const j = JSON.parse(localStorage.getItem(KEY) ?? "{}");
      if (j.ltv) setLtv(j.ltv);
      if (j.phone) setPhone(j.phone);
    } catch {
      /* optional */
    }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ ltv, phone }));
    } catch {
      /* optional */
    }
  }, [ltv, phone]);

  // ---- unit pick (cascading, always a valid combination) ----
  const brands = useMemo(carBrands, []);
  const eBrand = pick(brand, brands) ?? "";
  const families = useMemo(() => carFamilies(eBrand), [eBrand]);
  const eFamily = pick(family, families) ?? "";
  const types = useMemo(() => carTypes(eBrand, eFamily), [eBrand, eFamily]);
  const eType = pick(type, types) ?? "";
  const years = useMemo(() => carYearsFor(eType), [eType]);
  const eYear = pick(year, years) ?? 0;

  const mBrands = useMemo(motorBrands, []);
  const emBrand = pick(mBrand, mBrands) ?? "";
  const mTypes = useMemo(() => motorTypes(emBrand), [emBrand]);
  const emType = pick(mType, mTypes) ?? "";
  const mYears = useMemo(() => motorYearsFor(emType), [emType]);
  const emYear = pick(mYear, mYears) ?? 0;

  const isCar = mode === "mobil";
  const listOtr = isCar ? carOtr(eType, eYear) : motorOtr(emType, emYear);
  const manual = digits(otrManual);
  const otr = manual || listOtr || 0;
  const ltvMax = Math.min(Math.max(Number(ltv.replace(",", ".")) || 0, 1), 100) / 100;

  const tenors = isCar ? CAR_TENORS : MOTOR_TENORS;
  const range = isCar ? CAR_LOAN_RANGE : MOTOR_LOAN_RANGE;
  const step = isCar ? CAR_STEP : MOTOR_STEP;
  const typedLoan = digits(isCar ? loan : mLoan);
  const usedLoan = isCar ? snapCarLoan(typedLoan) : snapMotorLoan(typedLoan);
  const maxLoan = otr ? (isCar ? carMaxLoan(otr, ltvMax) : motorMaxLoan(otr, ltvMax)) : null;

  const quoteFor = (l: number, t: number): Quote | null => {
    if (!isCar) return motorQuote({ ro: mRo }, l, t);
    return otr && eYear ? carQuote({ kind, ro, mahal, otr, unitYear: eYear }, l, t) : null;
  };
  const rows = useMemo(
    () => tenors.map((t) => quoteFor(usedLoan, t)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mode, kind, ro, mahal, mRo, otr, eYear, usedLoan],
  );
  const maxRows = useMemo(
    () => (maxLoan ? tenors.map((t) => quoteFor(maxLoan, t)) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mode, kind, ro, mahal, mRo, otr, eYear, maxLoan],
  );

  const unitLabel = isCar ? `${eBrand} ${eType} ${eYear}` : `${emBrand} ${emType} ${emYear}`;
  const ltvNow = otr ? usedLoan / otr : null;
  const over = otr > 0 && usedLoan > otr * ltvMax + 1;

  const wa = (isCar ? tenors : tenors).filter((t) => share.includes(t));
  const waRows = wa.map((t) => quoteFor(usedLoan, t)).filter((q): q is Quote => !!q);
  const text =
    `Simulasi dana tunai (perkiraan, bukan penawaran mengikat)\nUnit: ${unitLabel}\nPinjaman: ${fmtMoney(usedLoan)}\n` +
    waRows.map((q) => `• ${q.tenor} bulan: ${fmtMoney(q.installment)}/bulan`).join("\n") +
    `\nAngsuran sudah termasuk biaya administrasi dan asuransi. Besaran akhir mengikuti hasil analisis kredit. Syarat dan ketentuan berlaku. Perusahaan terdaftar dan diawasi OJK.` +
    (ref.trim() ? ` [ref: ${ref.trim()}]` : "");
  const ph = phone.replace(/\D/g, "").replace(/^0/, "62");
  const link = ph ? `https://wa.me/${ph}?text=${encodeURIComponent(text)}` : "";
  const toggle = (m: number) => setShare((t) => (t.includes(m) ? t.filter((x) => x !== m) : [...t, m]));
  const tenorLabel = (t: number) => `${t} bulan`;

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="WhatsApp"
        title="Simulasi Cicilan"
        desc={`Kalkulator dana tunai jaminan kendaraan mengikuti file "Tools Dana Tunai": harga OTR, rate jual, premi asuransi, biaya administrasi, angsuran, dan pinjaman maksimal. Harga OTR periode ${DATUN_PERIOD.replace(/^PERIODE\s*/i, "").toLowerCase()}. Hasilnya perkiraan, keputusan akhir mengikuti analisis kredit.`}
      />

      <div className="grid gap-4 lg:grid-cols-[2fr_3fr]">
        <Card title="Data unit & pinjaman">
          <div className="space-y-4">
            <Seg label="Jenis kendaraan" value={mode} onChange={setMode} options={[{ v: "mobil", t: "Mobil" }, { v: "motor", t: "Motor" }]} />

            {isCar ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <Seg label="Jenis mobil" value={kind} onChange={setKind} options={[{ v: "PASSANGER", t: "Passenger" }, { v: "PICKUP", t: "Pickup" }]} />
                  <Seg label="Nasabah" value={ro ? "RO" : "NON"} onChange={(v) => setRo(v === "RO")} options={[{ v: "NON", t: "Non RO" }, { v: "RO", t: "RO" }]} />
                </div>
                {kind === "PASSANGER" && <Seg label="Kelas rate" value={mahal ? "MAHAL" : "MURAH"} onChange={(v) => setMahal(v === "MAHAL")} options={[{ v: "MURAH", t: "Murah" }, { v: "MAHAL", t: "Mahal" }]} />}
                <div className="grid grid-cols-2 gap-3">
                  <Choice id="sim-brand" label="Brand" value={eBrand} options={brands} onChange={setBrand} />
                  <Choice id="sim-fam" label="Kategori" value={eFamily} options={families} onChange={setFamily} />
                </div>
                <Choice id="sim-type" label="Tipe" value={eType} options={types} onChange={setType} />
                <Choice id="sim-year" label="Tahun unit" value={eYear} options={years} onChange={(v) => setYear(Number(v))} />
              </>
            ) : (
              <>
                <Seg label="Nasabah" value={mRo ? "RO" : "NON"} onChange={(v) => setMRo(v === "RO")} options={[{ v: "NON", t: "Non RO" }, { v: "RO", t: "RO" }]} />
                <div className="grid grid-cols-2 gap-3">
                  <Choice id="sim-mbrand" label="Brand" value={emBrand} options={mBrands} onChange={setMBrand} />
                  <Choice id="sim-myear" label="Tahun unit" value={emYear} options={mYears} onChange={(v) => setMYear(Number(v))} />
                </div>
                <Choice id="sim-mtype" label="Tipe" value={emType} options={mTypes} onChange={setMType} />
              </>
            )}

            <div>
              <label className="label" htmlFor="sim-otr">
                OTR (Rp)
              </label>
              <input id="sim-otr" className="input" inputMode="numeric" placeholder={listOtr ? listOtr.toLocaleString("id-ID") : "tidak ada di daftar harga, isi manual"} value={manual ? manual.toLocaleString("id-ID") : ""} onChange={(e) => setOtrManual(e.target.value)} />
              <p className="mt-1 text-[12px] text-[var(--muted)]">{manual ? "Memakai OTR yang Anda isi." : listOtr ? `Otomatis dari daftar harga: ${fmtMoney(listOtr)}. Isi kolom ini hanya bila ingin memakai OTR lain.` : "Harga unit ini tidak tersedia di daftar, isi OTR manual."}</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label" htmlFor="sim-loan">
                  Pinjaman (Rp)
                </label>
                <input id="sim-loan" className="input" inputMode="numeric" value={typedLoan ? typedLoan.toLocaleString("id-ID") : ""} onChange={(e) => (isCar ? setLoan(e.target.value) : setMLoan(e.target.value))} />
              </div>
              <div>
                <label className="label" htmlFor="sim-ltv">
                  LTV maksimal (%)
                </label>
                <input id="sim-ltv" className="input" inputMode="decimal" value={ltv} onChange={(e) => setLtv(e.target.value)} />
              </div>
            </div>
            <p className="-mt-2 text-[12px] text-[var(--muted)]">
              Pinjaman dihitung per kelipatan {fmtMoney(step)} ({fmtMoney(range[0])} sampai {fmtMoney(range[1])}). {typedLoan && usedLoan !== typedLoan ? `Dipakai: ${fmtMoney(usedLoan)}. ` : ""}Batas LTV bukan dari file Excel, jadi bisa Anda ubah sesuai kebijakan.
            </p>
          </div>
        </Card>

        <div className="space-y-4">
          <Card title="Ringkasan" subtitle={unitLabel}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="OTR" value={otr ? fmtMoney(otr) : "–"} />
              <Stat label="LTV pinjaman ini" value={ltvNow !== null ? fmtPct(ltvNow, 1) : "–"} warn={over} />
              <Stat label={`Pinjaman maks. (LTV ${Math.round(ltvMax * 100)}%)`} value={maxLoan ? fmtMoney(maxLoan) : "–"} />
              <Stat label="Biaya adm + polis" value={fmtMoney(isCar ? CAR_ADM : MOTOR_ADM)} />
            </div>
            {over && <p className="mt-3 rounded-lg bg-[#fbf4df] p-2.5 text-[12.5px] text-[var(--warning-ink)]">Pinjaman ini melewati LTV maksimal {Math.round(ltvMax * 100)}% dari OTR. Pinjaman terbesar yang masih masuk: {maxLoan ? fmtMoney(maxLoan) : "tidak ada (OTR terlalu rendah)"}.</p>}
            {!otr && <p className="mt-3 text-[12.5px] text-[var(--muted)]">Isi OTR untuk melihat LTV dan pinjaman maksimal.</p>}
          </Card>

          <Card title="Angsuran per tenor" subtitle={`Pinjaman ${fmtMoney(usedLoan)}`}>
            <QuoteTable rows={rows} tenors={tenors} label={tenorLabel} />
          </Card>

          {maxLoan && (
            <Card title="Pada pinjaman maksimal" subtitle={`${fmtMoney(maxLoan)} · ${Math.round(ltvMax * 100)}% dari OTR`}>
              <QuoteTable rows={maxRows} tenors={tenors} label={tenorLabel} />
              <button className="btn mt-3" onClick={() => (isCar ? setLoan(String(maxLoan)) : setMLoan(String(maxLoan)))}>
                Pakai pinjaman maksimal
              </button>
            </Card>
          )}
        </div>
      </div>

      <Card title="Bagikan lewat WhatsApp" subtitle="Pesan hanya memuat unit, pinjaman, dan angsuran, tanpa komisi agen. Sudah ada keterangan syarat dan ketentuan serta status pengawasan OJK">
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3">
            <div>
              <div className="label">Tenor yang dikirim</div>
              <div className="flex flex-wrap gap-1.5">
                {tenors.map((m) => (
                  <button key={m} type="button" className="pill" aria-pressed={share.includes(m)} style={share.includes(m) ? { borderColor: "var(--ink)", background: "var(--surface-2)" } : undefined} onClick={() => toggle(m)}>
                    {m} bln
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="label" htmlFor="sim-w">
                Nomor WhatsApp tujuan (nasabah)
              </label>
              <input id="sim-w" className="input" inputMode="tel" placeholder="0812…" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="sim-r">
                Kode campaign (opsional)
              </label>
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

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="rounded-lg bg-[var(--surface-2)] p-3">
      <div className="text-[11.5px] text-[var(--muted)]">{label}</div>
      <div className={`mt-0.5 text-[15px] font-semibold tnum ${warn ? "text-[var(--warning-ink)]" : ""}`}>{value}</div>
    </div>
  );
}

function QuoteTable({ rows, tenors, label }: { rows: (Quote | null)[]; tenors: number[]; label: (t: number) => string }) {
  return (
    <div className="-mx-4 overflow-x-auto">
      <table className="data">
        <thead>
          <tr>
            <th>Tenor</th>
            <th className="num">Angsuran / bulan</th>
            <th className="num">Rate jual</th>
            <th className="num">Premi asuransi</th>
            <th className="num">Adm + polis</th>
            <th className="num">Pokok hutang</th>
            <th className="num">Komisi agen (internal)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((q, i) => (
            <tr key={tenors[i]}>
              <td>{label(tenors[i])}</td>
              {q ? (
                <>
                  <td className="num font-semibold">{fmtMoney(q.installment)}</td>
                  <td className="num">{fmtPct(q.rate, 2)}</td>
                  <td className="num">{fmtMoney(Math.round(q.asr))}</td>
                  <td className="num">{fmtMoney(q.adm)}</td>
                  <td className="num">{fmtMoney(Math.round(q.principal))}</td>
                  <td className="num">{q.commission != null ? fmtMoney(q.commission) : "–"}</td>
                </>
              ) : (
                <td className="num text-[var(--muted)]" colSpan={6}>
                  tidak tersedia
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
