"use client";

import { useState } from "react";
import { PageHeader } from "@/components/shell";
import { ResourceTable } from "@/components/resource-table";
import { useAnalytics } from "@/components/use-analytics";
import { Card, MiniTable } from "@/components/charts";
import { Chip } from "@/components/cells";
import { fmtDate, fmtMoney, formatValue, monthStart, todayISO } from "@/lib/format";

function Simulator({ wallets }: { wallets: NonNullable<ReturnType<typeof useAnalytics>["data"]>["wallets"] }) {
  const [idx, setIdx] = useState(0);
  const [daily, setDaily] = useState("");
  const [topup, setTopup] = useState("");
  const w = wallets[Math.min(idx, wallets.length - 1)];
  const spend = Number(daily) || w.burnPerDay;
  const balance = Math.max(0, w.closing) + (Number(topup) || 0);
  const days = spend > 0 ? balance / spend : null;
  const until = days !== null && days < 400 ? new Date(Date.now() + days * 86400000).toISOString().slice(0, 10) : null;
  return (
    <Card title="Simulasi saldo" subtitle="Coba ubah belanja harian atau tambah top up, lihat saldo cukup sampai kapan">
      <div className="grid gap-3 md:grid-cols-4">
        <select className="input" value={idx} onChange={(e) => setIdx(Number(e.target.value))} aria-label="Akun iklan">
          {wallets.map((x, i) => (
            <option key={i} value={i}>
              {x.brand} · {x.platform}
            </option>
          ))}
        </select>
        <input className="input" type="number" placeholder={`Belanja/hari (kini ${Math.round(w.burnPerDay)})`} value={daily} onChange={(e) => setDaily(e.target.value)} />
        <input className="input" type="number" placeholder="Tambah top up (Rp)" value={topup} onChange={(e) => setTopup(e.target.value)} />
        <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-[13.5px]">
          {days === null ? "Belum ada belanja" : (
            <>
              Cukup <b>{Math.floor(days)} hari</b>
              {until ? <> · habis ±<b>{fmtDate(until)}</b></> : null}
            </>
          )}
        </div>
      </div>
    </Card>
  );
}

export default function BudgetPage() {
  const { data: a, reload } = useAnalytics();
  const [tick, setTick] = useState(0);
  const history = a?.walletHistory ?? [];
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Iklan" title="Saldo & Top Up Iklan" desc="Saldo terbawa antar bulan: Saldo akhir = saldo awal + top up − belanja iklan nyata (dari data campaign), dan menjadi saldo awal bulan berikutnya. Saldo awal cukup diisi sekali di bulan pertama; setelah itu catat top up saja." />

      <Card title="Posisi saldo bulan ini" subtitle="Bulan pada akhir periode filter · estimasi hari tersisa dari rata-rata belanja harian bulan berjalan">
        <MiniTable
          cols={[
            { key: "brand", label: "Brand" }, { key: "platform", label: "Platform" }, { key: "opening", label: "Saldo awal", format: "money" }, { key: "topup", label: "Top up", format: "money" },
            { key: "spent", label: "Belanja iklan", format: "money" }, { key: "closing", label: "Saldo akhir", format: "money" },
            { key: "burnPerDay", label: "Belanja/hari", format: "money" }, { key: "daysLeft", label: "Cukup (hari)", format: "number" }, { key: "emptyOn", label: "Perkiraan habis", format: "date" }, { key: "planned", label: "Rencana top up", format: "money" },
          ]}
          rows={a?.wallets ?? []}
          empty="Belum ada data saldo — tambahkan saldo awal & top up di bawah"
        />
        <p className="mt-3 text-[12px] text-[var(--muted)]">Belanja iklan diambil dari Ads Campaign per brand & platform; belanja yang melintas dua bulan dibagi proporsional per hari.</p>
      </Card>

      {(a?.wallets.length ?? 0) > 0 && <Simulator wallets={a!.wallets} />}

      {history.length > 0 && (
        <Card title="Riwayat saldo per bulan" subtitle="Lihat bagaimana saldo terbawa dari bulan ke bulan">
          <div className="-mx-5 overflow-x-auto">
            <table className="data">
              <thead>
                <tr>
                  <th>Bulan</th><th>Brand</th><th>Platform</th>
                  <th className="text-right">Saldo awal</th><th className="text-right">Top up</th>
                  <th className="text-right">Belanja iklan</th><th className="text-right">Saldo akhir</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={`${h.brand}|${h.platform}|${h.month}`}>
                    <td className="whitespace-nowrap">{fmtDate(h.month).replace(/^\d+ /, "")}</td>
                    <td>{h.brand}</td>
                    <td><Chip value={h.platform} /></td>
                    <td className="text-right tnum">
                      {formatValue(h.opening, "money")}
                      {h.carried && <span className="ml-1.5 text-[11px] text-[var(--muted)]">terbawa</span>}
                    </td>
                    <td className="text-right tnum">{h.topup ? formatValue(h.topup, "money") : "–"}</td>
                    <td className="text-right tnum">{formatValue(h.spent, "money")}</td>
                    <td className={`text-right font-semibold tnum ${h.closing < 0 ? "text-[var(--critical-ink)]" : ""}`}>{fmtMoney(h.closing)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <div>
        <h2 className="serif mb-3 text-[20px]">Catatan top up & saldo awal</h2>
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
