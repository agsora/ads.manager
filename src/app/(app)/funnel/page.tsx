"use client";

import { PageHeader } from "@/components/shell";
import { useAnalytics } from "@/components/use-analytics";
import { Card, Empty, Funnel, MiniTable, PageSkeleton } from "@/components/charts";
import { fmtMoney, fmtNum, fmtPct } from "@/lib/format";

export default function FunnelPage() {
  const { data: a, loading, error } = useAnalytics();
  if (!a) return loading || !error ? <PageSkeleton kpis={4} cards={2} /> : null;

  // biggest leak = the step with the lowest pass-through to the next step
  const steps = a.funnel;
  const leaks = steps
    .slice(1)
    .map((s, i) => ({ from: steps[i].name, to: s.name, rate: steps[i].value ? s.value / steps[i].value : null, base: steps[i].value }))
    .filter((l) => l.rate !== null && l.base > 0);
  const weakest = [...leaks].sort((x, y) => (x.rate ?? 1) - (y.rate ?? 1))[0];
  const k = a.kpis;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Insight"
        title="Funnel & Atribusi"
        desc="Dari impresi iklan sampai deal: di tahap mana calon pelanggan paling banyak hilang, dan campaign mana yang benar-benar menghasilkan deal (bukan hanya klik)."
      />
      <Card title="Funnel pembiayaan" subtitle="Lead masuk sampai akad (cair). Isi Tahap Pembiayaan dan Nilai Pencairan di WA Leads agar terhitung.">
        {a.financing.tracked ? (
          <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
            <Funnel steps={a.financing.funnel} />
            <dl className="space-y-3 text-[14px]">
              <Row label="Biaya per survei" value={fmtMoney(a.financing.costPerSurvey)} />
              <Row label="Biaya per akad" value={fmtMoney(a.financing.costPerAkad)} strong />
              <Row label="Nilai pencairan" value={fmtMoney(a.financing.disbursed)} />
              <Row label="Rata-rata per akad" value={fmtMoney(a.financing.avgTicket)} />
              <p className="border-t border-[var(--line)] pt-3 text-[12px] leading-relaxed text-[var(--muted)]">Biaya = belanja iklan + blast + influencer pada periode ini.</p>
            </dl>
          </div>
        ) : (
          <Empty text="Belum ada lead yang diberi Tahap Pembiayaan — ubah lewat Edit di WA Leads" />
        )}
      </Card>

      <div className="stat-grid">
        <Stat label="Biaya per Lead" value={fmtMoney(k.ads.spend && k.leads.leads ? k.ads.spend / k.leads.leads : null)} hint="Total biaya iklan ÷ semua leads" />
        <Stat label="Biaya per Deal" value={fmtMoney(k.ads.spend && k.leads.deals ? k.ads.spend / k.leads.deals : null)} hint="Total biaya iklan ÷ deal" />
        <Stat label="Lead → Deal" value={fmtPct(k.leads.dealRate)} hint={`${fmtNum(k.leads.deals)} deal dari ${fmtNum(k.leads.leads)} leads`} />
        <Stat label="Leads HOT" value={fmtNum(k.leads.hot)} hint="Prospek paling siap dibeli" />
      </div>

      <div className="grid gap-5 lg:grid-cols-[3fr_2fr]">
        <Card title="Corong penjualan" subtitle="Persentase kecil di satu tahap berarti lebih banyak calon pelanggan hilang di sana">
          <Funnel steps={steps} />
        </Card>
        <Card title="Titik bocor terbesar">
          {weakest ? (
            <div className="space-y-3 text-[14px] leading-relaxed">
              <p>
                Dari <b>{weakest.from}</b> ke <b>{weakest.to}</b> hanya <b className="serif text-[22px]">{fmtPct(weakest.rate, 1)}</b> yang lanjut.
              </p>
              <p className="text-[var(--ink-2)]">{advice(weakest.to)}</p>
            </div>
          ) : (
            <Empty text="Isi data iklan & leads untuk melihat titik bocor" />
          )}
        </Card>
      </div>

      <Card title="Atribusi per campaign" subtitle="Leads yang punya kode campaign dihubungkan ke biaya iklannya. Isi kolom Kode Campaign di WA Leads agar tabel ini terisi.">
        <MiniTable
          cols={[
            { key: "ref", label: "Kode Campaign" },
            { key: "leads", label: "Leads", format: "number" },
            { key: "hot", label: "HOT", format: "number" },
            { key: "deals", label: "Deal", format: "number" },
            { key: "dealRate", label: "Lead→Deal", format: "percent" },
            { key: "spend", label: "Biaya Iklan", format: "money" },
            { key: "cpl", label: "Biaya/Lead", format: "money" },
            { key: "cpa", label: "Biaya/Deal", format: "money" },
            { key: "dealValue", label: "Omzet Deal", format: "money" },
            { key: "roas", label: "ROAS", format: "decimal" },
          ]}
          rows={a.attribution}
          empty="Belum ada lead dengan kode campaign"
        />
      </Card>

      <Card title="Per sumber trafik" subtitle="Dari mana leads datang dan seberapa banyak yang jadi deal">
        <MiniTable
          cols={[
            { key: "name", label: "Sumber" },
            { key: "leads", label: "Leads", format: "number" },
            { key: "hot", label: "HOT", format: "number" },
            { key: "deals", label: "Deal", format: "number" },
            { key: "dealRate", label: "Lead→Deal", format: "percent" },
            { key: "ghost", label: "Tidak membalas", format: "number" },
            { key: "cost", label: "Biaya", format: "money" },
            { key: "cpl", label: "Biaya/Lead", format: "money" },
            { key: "cpa", label: "Biaya/Deal", format: "money" },
          ]}
          rows={a.leadsBySource}
          empty="Belum ada data leads"
        />
      </Card>
    </div>
  );
}

function advice(to: string) {
  if (to === "Klik") return "Iklan sering tayang tapi jarang diklik. Perbaiki visual, headline, atau targeting audiens.";
  if (to === "Percakapan Ads") return "Klik banyak tapi sedikit yang chat. Cek kecepatan halaman tujuan dan pastikan tombol WhatsApp jelas.";
  if (to === "Total Leads") return "Banyak percakapan belum tercatat sebagai lead. Pastikan tim mencatat setiap chat masuk di WA Leads.";
  if (to === "Deal") return "Leads banyak tapi sedikit yang deal. Follow up leads HOT lebih cepat dan cek hambatan harga/syarat.";
  return "Perbaiki tahap ini dulu sebelum menambah budget iklan.";
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="px-4 py-4">
      <div className="text-[12.5px] text-[var(--ink-2)]">{label}</div>
      <div className="serif mt-1 text-[26px] leading-tight tnum">{value}</div>
      <div className="mt-1 text-[12px] text-[var(--muted)]">{hint}</div>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[var(--ink-2)]">{label}</dt>
      <dd className={`tnum ${strong ? "serif text-[22px]" : "font-semibold"}`}>{value}</dd>
    </div>
  );
}
