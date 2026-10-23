"use client";

import { useState } from "react";
import { AlertTriangle, CircleCheck } from "lucide-react";
import { PageHeader } from "@/components/shell";
import { ResourceTable } from "@/components/resource-table";
import { useAnalytics } from "@/components/use-analytics";
import { Card, Empty } from "@/components/charts";
import { Chip } from "@/components/cells";
import { fmtDate, fmtMoney, fmtNum, fmtPct, monthStart, todayISO } from "@/lib/format";

type Wallets = NonNullable<ReturnType<typeof useAnalytics>["data"]>["wallets"];

function WalletCard({ w }: { w: Wallets[number] }) {
  const minus = w.closing < 0;
  const low = !minus && w.daysLeft !== null && w.daysLeft < 7;
  const used = w.available > 0 ? Math.min(1, w.spent / w.available) : w.spent > 0 ? 1 : 0;
  const tone = minus ? "var(--critical)" : low ? "var(--warning)" : "var(--s2)";
  return (
    <div className="card flex flex-col p-5">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 truncate text-[14px] font-semibold">{w.brand}</div>
        <Chip value={w.platform} />
      </div>
      <div className="eyebrow mt-4">Saldo akhir</div>
      <div className="serif mt-0.5 whitespace-nowrap text-[32px] leading-none tracking-[-0.015em]" style={{ color: minus ? "var(--critical-ink)" : undefined }}>
        {fmtMoney(w.closing)}
      </div>

      <div className="mt-4 h-2 overflow-hidden rounded-full bg-[var(--track)]" role="img" aria-label={`${fmtPct(used, 0)} dari dana terpakai`}>
        <div className="h-2 rounded-full" style={{ width: `${used * 100}%`, background: tone }} />
      </div>
      <div className="mt-1.5 text-[12px] text-[var(--muted)]">{fmtPct(used, 0)} dari dana tersedia terpakai</div>

      <dl className="mt-4 space-y-2 border-t border-[var(--grid)] pt-4 text-[13.5px]">
        <Row label="Saldo awal" value={fmtMoney(w.opening)} hint={w.carried ? "terbawa" : undefined} />
        <Row label="Top up" value={w.topup ? `+ ${fmtMoney(w.topup)}` : "–"} />
        <Row label={w.kind === "blast" ? "Biaya blast" : w.kind === "influencer" ? "Fee influencer" : "Belanja iklan"} value={w.spent ? `− ${fmtMoney(w.spent)}` : "–"} hint={w.kind === "ads" ? undefined : "dari laporan " + (w.kind === "blast" ? "WA Blast" : "Influencer")} />
        <Row label="Belanja per hari" value={fmtMoney(w.burnPerDay)} />
        {w.planned > 0 && <Row label="Rencana top up" value={fmtMoney(w.planned)} />}
      </dl>

      <div
        className={`mt-4 flex items-start gap-2 rounded-lg px-3 py-2.5 text-[13px] leading-snug ${minus ? "bg-[#f8e4dc] text-[var(--critical-ink)]" : low ? "bg-[#f8eed6] text-[var(--warning-ink)]" : "bg-[var(--surface-2)] text-[var(--ink-2)]"}`}
      >
        {minus || low ? <AlertTriangle size={15} className="mt-0.5 shrink-0" /> : <CircleCheck size={15} className="mt-0.5 shrink-0" />}
        <span>
          {minus ? (
            <>
              <b>Saldo minus.</b> Cek data top up atau belanja, lalu top up agar iklan tidak berhenti.
            </>
          ) : w.emptyOn ? (
            <>
              Cukup <b>{fmtNum(w.daysLeft ?? 0, 0)} hari</b>, perkiraan habis <b>{fmtDate(w.emptyOn)}</b>
              {low ? ". Segera top up." : "."}
            </>
          ) : (
            "Belum ada belanja bulan ini, jadi belum bisa diperkirakan."
          )}
        </span>
      </div>
    </div>
  );
}

function Row({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[var(--ink-2)]">
        {label}
        {hint && <span className="ml-1.5 text-[11px] text-[var(--muted)]">{hint}</span>}
      </dt>
      <dd className="whitespace-nowrap font-medium tnum">{value}</dd>
    </div>
  );
}

function Simulator({ wallets }: { wallets: Wallets }) {
  const [idx, setIdx] = useState(0);
  const [daily, setDaily] = useState("");
  const [topup, setTopup] = useState("");
  const w = wallets[Math.min(idx, wallets.length - 1)];
  const spend = Number(daily) || w.burnPerDay;
  const balance = Math.max(0, w.closing) + (Number(topup) || 0);
  const days = spend > 0 ? balance / spend : null;
  const until = days !== null && days < 400 ? new Date(Date.now() + days * 86400000).toISOString().slice(0, 10) : null;
  return (
    <Card title="Simulasi saldo" subtitle="Ubah belanja harian atau tambah top up, lihat saldo cukup sampai kapan">
      <div className="grid gap-3 md:grid-cols-[1.2fr_1fr_1fr_1.4fr]">
        <div>
          <label className="label" htmlFor="sim-acc">Akun iklan</label>
          <select id="sim-acc" className="input" value={idx} onChange={(e) => setIdx(Number(e.target.value))}>
            {wallets.map((x, i) => (
              <option key={i} value={i}>
                {x.brand} · {x.platform}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="sim-daily">Belanja per hari (Rp)</label>
          <input id="sim-daily" className="input" type="number" placeholder={String(Math.round(w.burnPerDay))} value={daily} onChange={(e) => setDaily(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="sim-top">Tambah top up (Rp)</label>
          <input id="sim-top" className="input" type="number" placeholder="0" value={topup} onChange={(e) => setTopup(e.target.value)} />
        </div>
        <div>
          <div className="label">Hasil</div>
          <div className="flex h-[38px] items-center rounded-lg bg-[var(--surface-2)] px-3 text-[13.5px]">
            {days === null ? (
              "Belum ada belanja"
            ) : (
              <span>
                Cukup <b>{Math.floor(days)} hari</b>
                {until ? (
                  <>
                    {" "}
                    · habis <b>{fmtDate(until)}</b>
                  </>
                ) : null}
              </span>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

export default function BudgetPage() {
  const { data: a, reload } = useAnalytics();
  const [tick, setTick] = useState(0);
  const history = a?.walletHistory ?? [];
  const wallets = a?.wallets ?? [];
  const totalNow = wallets.reduce((s, w) => s + w.closing, 0);
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Iklan" title="Saldo & Top Up Iklan" desc="Saldo terbawa antar bulan: saldo akhir = saldo awal + top up − pemakaian nyata (belanja Ads Campaign, biaya WA Blast, atau fee Influencer sesuai Sumber Dana), dan menjadi saldo awal bulan berikutnya. Saldo awal cukup diisi sekali di bulan pertama; setelah itu catat top up saja." />

      <section>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="serif text-[22px]">Posisi saldo bulan ini</h2>
          {wallets.length > 0 && (
            <div className="text-[13px] text-[var(--ink-2)]">
              Total semua akun <b className="tnum">{fmtMoney(totalNow)}</b>
            </div>
          )}
        </div>
        {wallets.length ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {wallets.map((w) => (
              <WalletCard key={`${w.brand}|${w.platform}`} w={w} />
            ))}
          </div>
        ) : (
          <div className="card">
            <Empty text="Belum ada data saldo — tambahkan saldo awal & top up di bagian bawah" />
          </div>
        )}
        <p className="mt-3 text-[12px] text-[var(--muted)]">Pemakaian diambil otomatis: Meta/TikTok/Google dari Ads Campaign, “WhatsApp Blast” dari laporan WA Blast, “Influencer” dari fee Influencer (per brand). Belanja yang melintas dua bulan dibagi proporsional per hari.</p>
      </section>

      {wallets.length > 0 && <Simulator wallets={wallets} />}

      {history.length > 0 && (
        <Card title="Riwayat saldo per bulan" subtitle="Bagaimana saldo terbawa dari bulan ke bulan">
          <div className="-mx-5 overflow-x-auto">
            <table className="data">
              <thead>
                <tr>
                  <th>Bulan</th>
                  <th>Brand</th>
                  <th>Platform</th>
                  <th className="num">Saldo awal</th>
                  <th className="num">Top up</th>
                  <th className="num">Pemakaian</th>
                  <th className="num">Saldo akhir</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={`${h.brand}|${h.platform}|${h.month}`}>
                    <td className="whitespace-nowrap">{fmtDate(h.month).replace(/^\d+ /, "")}</td>
                    <td className="whitespace-nowrap">{h.brand}</td>
                    <td>
                      <Chip value={h.platform} />
                    </td>
                    <td className="num">
                      {fmtMoney(h.opening)}
                      {h.carried && <span className="ml-1.5 text-[11px] text-[var(--muted)]">terbawa</span>}
                    </td>
                    <td className="num">{h.topup ? fmtMoney(h.topup) : "–"}</td>
                    <td className="num">{fmtMoney(h.spent)}</td>
                    <td className={`num font-semibold ${h.closing < 0 ? "text-[var(--critical-ink)]" : ""}`}>{fmtMoney(h.closing)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <div>
        <h2 className="serif mb-3 text-[22px]">Catatan top up & saldo awal</h2>
        <ResourceTable
          resourceKey="wallets"
          ignoreDate
          quickFilters={["platform"]}
          defaults={{ period: monthStart(todayISO()) }}
          reloadKey={tick}
          onChanged={() => {
            reload();
            setTick((t) => t + 1);
          }}
        />
      </div>
    </div>
  );
}
