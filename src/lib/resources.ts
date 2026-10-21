// Single source of truth for every editable module: DB columns, form fields,
// table columns, import header aliases and computed metrics.

export type FieldType =
  | "text"
  | "longtext"
  | "date"
  | "time"
  | "number"
  | "money"
  | "percent"
  | "select"
  | "url"
  | "phone"
  | "rating"
  | "brand";

export interface Field {
  key: string;
  label: string;
  type: FieldType;
  /** option-set key (editable in Settings) for select fields */
  options?: string;
  required?: boolean;
  /** offer suggestions from a live list (e.g. team member names) */
  suggest?: "users";
  /** extra header names recognised on import (case-insensitive) */
  aliases?: string[];
  /** hide from the list table (still in form / export) */
  hideInTable?: boolean;
  group?: string;
}

export type Row = Record<string, unknown> & { id?: number };

export interface Computed {
  key: string;
  label: string;
  format: "number" | "money" | "percent" | "decimal" | "text";
  fn: (r: Row) => number | string | null;
}

export interface Resource {
  key: string;
  table: string;
  label: string;
  singular: string;
  description: string;
  dateField: string;
  titleField: string;
  fields: Field[];
  computed?: Computed[];
  /** a row is imported only if at least one of these has a value */
  importKeys: string[];
  /** sheet-name keywords used when importing a whole workbook */
  sheetHints: string[];
  /** re-importing a row with the same values for these keys replaces the old row */
  upsertKeys?: string[];
  /** on re-import, these fields keep their saved value when the file has no such column */
  preserveOnReimport?: string[];
  /** fill derived values (e.g. normalised phone, loan amount) before saving */
  derive?: (r: Record<string, unknown>) => Record<string, unknown>;
  defaultSort?: string;
}

export const n = (v: unknown): number => {
  if (v === null || v === undefined || v === "") return 0;
  const x = typeof v === "number" ? v : Number(String(v).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(x) ? x : 0;
};
const div = (a: number, b: number) => (b ? a / b : null);
const daysBetween = (a: unknown, b: unknown) => {
  if (!a || !b) return null;
  const d = (new Date(String(b)).getTime() - new Date(String(a)).getTime()) / 86400000;
  return Number.isFinite(d) ? Math.round(d) : null;
};

export const RESOURCES: Resource[] = [
  {
    key: "ads",
    table: "ad_campaigns",
    label: "Ads Campaign",
    singular: "Campaign",
    description: "Detail performa iklan Meta, TikTok, Google — budget, jangkauan, klik, percakapan & omzet (ROAS).",
    dateField: "start_date",
    titleField: "campaign_name",
    importKeys: ["campaign_name"],
    sheetHints: ["detail ads", "ads report - detail", "campaign", "report-ads", "meta ads", "ads manager"],
    defaultSort: "start_date",
    upsertKeys: ["brand", "platform", "campaign_name", "start_date", "end_date"],
    preserveOnReimport: ["revenue", "notes", "focus", "content_link", "objective"],
    derive: (r) => {
      const today = new Date().toISOString().slice(0, 10);
      if (!r.end_date && r.start_date) r.end_date = r.start_date;
      if (!r.status && r.end_date) r.status = String(r.end_date) < today ? "Done" : "Running";
      if (!r.objective && n(r.conversations) > 0) r.objective = "Pesan WhatsApp";
      return r;
    },
    fields: [
      { key: "brand", label: "Brand", type: "brand", required: true },
      { key: "platform", label: "Platform", type: "select", options: "platform", required: true },
      { key: "campaign_name", label: "Nama Campaign", type: "text", required: true, aliases: ["campaign", "nama kampanye", "campaign name", "nama campaign"] },
      { key: "objective", label: "Jenis Campaign", type: "select", options: "ad_objective", aliases: ["objective", "tujuan"] },
      { key: "focus", label: "Fokus Campaign", type: "text", hideInTable: true },
      { key: "content_link", label: "Link Konten", type: "url", hideInTable: true, aliases: ["link konten (file asli)", "link konten"] },
      { key: "start_date", label: "Mulai", type: "date", required: true, aliases: ["tanggal", "awal pelaporan", "reporting starts", "day", "tanggal mulai", "hari/tgl"] },
      { key: "end_date", label: "Berakhir", type: "date", aliases: ["akhir pelaporan", "reporting ends", "tanggal berakhir", "selesai"] },
      { key: "daily_budget", label: "Anggaran/Hari", type: "money", hideInTable: true, aliases: ["anggaran kampanye", "anggaran set iklan", "campaign budget", "ad set budget", "anggaran per hari", "budget harian"] },
      { key: "reach", label: "Jangkauan", type: "number", aliases: ["reach"] },
      { key: "impressions", label: "Impresi", type: "number", aliases: ["impression", "impressions"] },
      { key: "spend", label: "Budget Terpakai", type: "money", aliases: ["jumlah yang dibelanjakan (idr)", "jumlah yang dibelanjakan (idr)/budget terpakai", "jumlah yang dibelanjakan", "amount spent (idr)", "amount spent", "spend", "biaya (idr)", "cost"] },
      { key: "clicks", label: "Klik Tautan", type: "number", aliases: ["klik tautan", "link clicks", "clicks"] },
      { key: "views", label: "Tayangan", type: "number", hideInTable: true, aliases: ["tayangan", "views", "video views"] },
      { key: "conversations", label: "Percakapan", type: "number", aliases: ["percakapan pesan dimulai", "messaging conversations started", "hasil", "results", "leads"] },
      { key: "revenue", label: "Omzet", type: "money", aliases: ["omset", "revenue", "omzet dari ads"] },
      { key: "status", label: "Status", type: "select", options: "ad_status" },
      { key: "notes", label: "Keterangan", type: "longtext", hideInTable: true, aliases: ["catatan"] },
    ],
    computed: [
      { key: "days", label: "Total Hari", format: "number", fn: (r) => daysBetween(r.start_date, r.end_date) },
      { key: "frequency", label: "Frekuensi", format: "decimal", fn: (r) => div(n(r.impressions), n(r.reach)) },
      { key: "ctr", label: "CTR (klik tautan)", format: "percent", fn: (r) => div(n(r.clicks), n(r.impressions)) },
      { key: "cpc", label: "CPC", format: "money", fn: (r) => div(n(r.spend), n(r.clicks)) },
      { key: "cpm", label: "CPM", format: "money", fn: (r) => { const v = div(n(r.spend), n(r.impressions)); return v === null ? null : v * 1000; } },
      { key: "cost_per_conv", label: "Biaya/Percakapan", format: "money", fn: (r) => div(n(r.spend), n(r.conversations)) },
      { key: "roas", label: "ROAS", format: "decimal", fn: (r) => div(n(r.revenue), n(r.spend)) },
      { key: "roi", label: "ROI", format: "percent", fn: (r) => (n(r.spend) && n(r.revenue) ? (n(r.revenue) - n(r.spend)) / n(r.spend) : null) },
    ],
  },
  {
    key: "wallets",
    table: "ad_wallets",
    label: "Saldo & Top Up Iklan",
    singular: "Saldo Bulanan",
    description: "Saldo akun iklan per brand & platform. Isi saldo awal hanya di bulan pertama; bulan berikutnya otomatis = saldo akhir bulan lalu (sudah dipotong belanja iklan).",
    dateField: "period",
    titleField: "brand",
    importKeys: ["period", "brand"],
    sheetHints: ["saldo", "wallet", "top up"],
    defaultSort: "period",
    fields: [
      { key: "period", label: "Bulan (tgl 1)", type: "date", required: true, aliases: ["bulan", "periode", "month"] },
      { key: "brand", label: "Brand", type: "brand", required: true },
      { key: "platform", label: "Platform", type: "select", options: "platform", required: true },
      { key: "opening_balance", label: "Saldo Awal (bulan pertama saja)", type: "money" },
      { key: "topup", label: "Total Top Up", type: "money", aliases: ["top up"] },
      { key: "planned_topup", label: "Rencana Top Up", type: "money", aliases: ["plan top up"] },
      { key: "notes", label: "Catatan", type: "longtext", hideInTable: true },
    ],
    computed: [
      { key: "available", label: "Dana Tersedia", format: "money", fn: (r) => n(r.opening_balance) + n(r.topup) },
    ],
  },
  {
    key: "content",
    table: "content_plans",
    label: "Content Plan",
    singular: "Konten",
    description: "Perencanaan & hasil konten sosial media: jadwal, pilar, PIC, status, dan engagement.",
    dateField: "post_date",
    titleField: "title",
    importKeys: ["title"],
    sheetHints: ["content plan", "input content", "konten"],
    defaultSort: "post_date",
    fields: [
      { key: "post_date", label: "Tanggal Posting", type: "date", required: true, group: "Rencana" },
      { key: "post_time", label: "Jam Posting", type: "time", hideInTable: true, group: "Rencana" },
      { key: "brand", label: "Brand", type: "brand", required: true, group: "Rencana" },
      { key: "channel", label: "Channel", type: "select", options: "content_channel", required: true, group: "Rencana" },
      { key: "content_type", label: "Jenis Konten", type: "select", options: "content_type", group: "Rencana" },
      { key: "pillar", label: "Konten Pilar", type: "select", options: "content_pillar", group: "Rencana", aliases: ["pilar"] },
      { key: "title", label: "Judul Konten", type: "text", required: true, group: "Rencana", aliases: ["judul"] },
      { key: "pic", label: "PIC", type: "text", group: "Rencana", suggest: "users" },
      { key: "caption", label: "Caption / Brief", type: "longtext", hideInTable: true, group: "Rencana", aliases: ["caption", "brief", "copywriting"] },
      { key: "brief_link", label: "Link Brief/Detail", type: "url", hideInTable: true, group: "Rencana", aliases: ["link detail konten"] },
      { key: "status", label: "Status", type: "select", options: "content_status", group: "Rencana", aliases: ["status konten"] },
      { key: "approval_status", label: "Approval", type: "select", options: "approval_status", group: "Approval", aliases: ["approval"] },
      { key: "approval_note", label: "Catatan Reviewer", type: "longtext", hideInTable: true, group: "Approval", aliases: ["catatan reviewer", "revisi"] },
      { key: "actual_date", label: "Tanggal Aktual", type: "date", hideInTable: true, group: "Hasil" },
      { key: "post_link", label: "Link Postingan", type: "url", hideInTable: true, group: "Hasil" },
      { key: "reach", label: "Reach", type: "number", hideInTable: true, group: "Hasil" },
      { key: "views", label: "Views", type: "number", hideInTable: true, group: "Hasil" },
      { key: "likes", label: "Like", type: "number", hideInTable: true, group: "Hasil" },
      { key: "comments", label: "Comment", type: "number", hideInTable: true, group: "Hasil" },
      { key: "shares", label: "Share", type: "number", hideInTable: true, group: "Hasil" },
      { key: "saves", label: "Saved", type: "number", hideInTable: true, group: "Hasil" },
      { key: "followers", label: "Followers saat posting", type: "number", hideInTable: true, group: "Hasil" },
    ],
    computed: [
      { key: "engagement", label: "Engagement", format: "number", fn: (r) => n(r.likes) + n(r.comments) + n(r.saves) },
      { key: "er", label: "ER", format: "percent", fn: (r) => div(n(r.likes) + n(r.comments) + n(r.saves), n(r.followers)) },
      {
        key: "result_state",
        label: "Hasil",
        format: "text",
        fn: (r) => {
          const due = String(r.post_date ?? "") <= new Date().toISOString().slice(0, 10);
          if (r.status === "Cancel") return null;
          if (r.status !== "Posted") return due ? "Belum tayang" : "Terjadwal";
          return n(r.likes) || n(r.reach) || n(r.views) ? "Lengkap" : "Belum diisi";
        },
      },
      {
        key: "on_time",
        label: "Tepat Waktu",
        format: "text",
        fn: (r) => (r.status === "Posted" && r.actual_date ? ((daysBetween(r.post_date, r.actual_date) ?? 0) <= 0 ? "Ya" : "Telat") : null),
      },
    ],
  },
  {
    key: "followers",
    table: "follower_snapshots",
    label: "Followers Tracker",
    singular: "Snapshot Followers",
    description: "Catat jumlah followers per channel secara berkala untuk melihat pertumbuhan.",
    dateField: "snapshot_date",
    titleField: "channel",
    importKeys: ["followers"],
    sheetHints: ["followers"],
    defaultSort: "snapshot_date",
    fields: [
      { key: "snapshot_date", label: "Tanggal", type: "date", required: true },
      { key: "brand", label: "Brand", type: "brand", required: true },
      { key: "channel", label: "Channel", type: "select", options: "social_account", required: true },
      { key: "followers", label: "Followers", type: "number", required: true },
      { key: "notes", label: "Catatan", type: "text" },
    ],
  },
  {
    key: "kpi",
    table: "kpi_targets",
    label: "Target KPI Bulanan",
    singular: "Target KPI",
    description: "Target bulanan per brand — dipakai dashboard untuk membandingkan aktual vs target.",
    dateField: "period",
    titleField: "brand",
    importKeys: ["period"],
    sheetHints: ["kpi"],
    defaultSort: "period",
    fields: [
      { key: "period", label: "Bulan (tgl 1)", type: "date", required: true },
      { key: "brand", label: "Brand", type: "brand", required: true },
      { key: "target_posts", label: "Target Jumlah Posting", type: "number" },
      { key: "target_er", label: "Target ER (%)", type: "percent" },
      { key: "target_leads", label: "Target Leads", type: "number" },
      { key: "target_deals", label: "Target Deal", type: "number" },
      { key: "target_revenue", label: "Target Omzet", type: "money" },
      { key: "ads_budget", label: "Budget Iklan", type: "money" },
      { key: "max_cpl", label: "Maks. Biaya/Lead", type: "money" },
      { key: "target_rating", label: "Target Rating Google", type: "number" },
    ],
  },
  {
    key: "events",
    table: "marketing_events",
    label: "Event & Tanggal Penting",
    singular: "Event",
    description: "Hari besar, promo, launching & event — tampil di kalender konten.",
    dateField: "event_date",
    titleField: "title",
    importKeys: ["title"],
    sheetHints: ["event"],
    defaultSort: "event_date",
    fields: [
      { key: "event_date", label: "Tanggal", type: "date", required: true },
      { key: "end_date", label: "Sampai", type: "date" },
      { key: "title", label: "Nama Event", type: "text", required: true },
      { key: "event_type", label: "Jenis", type: "select", options: "event_type" },
      { key: "brand", label: "Brand", type: "brand" },
      { key: "notes", label: "Catatan", type: "longtext" },
    ],
  },
  {
    key: "leads",
    table: "leads",
    label: "WA Leads",
    singular: "Lead",
    description: "Data chat masuk WhatsApp: sumber trafik, segmentasi HOT/WARM/COLD, follow up 1-3, dan status akhir.",
    dateField: "chat_date",
    titleField: "name",
    importKeys: ["chat_date", "name", "phone"],
    sheetHints: ["wa leads", "leads", "chat masuk"],
    defaultSort: "chat_date",
    fields: [
      { key: "chat_date", label: "Tanggal Chat", type: "date", required: true, aliases: ["tanggal chat masuk", "tanggal"] },
      { key: "brand", label: "Brand", type: "brand", required: true },
      { key: "name", label: "Nama", type: "text", aliases: ["nama / identitas", "nama"] },
      { key: "phone", label: "No. WhatsApp", type: "phone", aliases: ["nomor whatsapp", "no wa", "whatsapp"] },
      { key: "customer_type", label: "Jenis Pelanggan", type: "select", options: "customer_type" },
      { key: "source", label: "Sumber Trafik", type: "select", options: "lead_source" },
      { key: "campaign_ref", label: "Campaign/Blast Terkait", type: "text", hideInTable: true },
      { key: "plan_timing", label: "Rencana", type: "select", options: "plan_timing", hideInTable: true, aliases: ["rencana pinjaman", "rencana pembelian", "rencana"] },
      { key: "post_chat_status", label: "Status Pasca Chat", type: "select", options: "post_chat_status", hideInTable: true },
      { key: "segment", label: "Segmen", type: "select", options: "lead_segment", aliases: ["segmentasi prospek", "segmentasi"] },
      { key: "initial_status", label: "Status Awal", type: "select", options: "initial_status", hideInTable: true },
      { key: "need", label: "Kebutuhan/Keterangan", type: "longtext", hideInTable: true, aliases: ["keterangan (isi jika perlu)", "keterangan"] },
      { key: "followup_1", label: "Follow Up 1 (3-7 hr)", type: "longtext", hideInTable: true, aliases: ["follow up 1 (3-7 hari)", "follow up 1"] },
      { key: "followup_2", label: "Follow Up 2 (7-14 hr)", type: "longtext", hideInTable: true, aliases: ["follow up 2 (7-14 hari)", "follow up 2"] },
      { key: "followup_3", label: "Follow Up 3 (14-30 hr)", type: "longtext", hideInTable: true, aliases: ["follow up 3 (14-30 hari)", "follow up 3"] },
      { key: "final_status", label: "Status Akhir", type: "select", options: "final_status" },
      { key: "deal_value", label: "Nilai Deal", type: "money", aliases: ["nilai transaksi", "omzet"] },
      { key: "pic", label: "PIC/CS", type: "text", hideInTable: true },
    ],
    computed: [
      { key: "age_days", label: "Umur (hari)", format: "number", fn: (r) => daysBetween(r.chat_date, new Date().toISOString().slice(0, 10)) },
      {
        key: "next_action",
        label: "Aksi Berikutnya",
        format: "text",
        fn: (r) => {
          if (["Deal", "Cancel", "Ghosting"].includes(String(r.final_status))) return "Selesai";
          const age = daysBetween(r.chat_date, new Date().toISOString().slice(0, 10)) ?? 0;
          if (!r.followup_1) return age >= 3 ? "FU1 jatuh tempo" : "FU1 mulai H+3";
          if (!r.followup_2) return age >= 7 ? "FU2 jatuh tempo" : "Tunggu FU2";
          if (!r.followup_3) return age >= 14 ? "FU3 jatuh tempo" : "Tunggu FU3";
          return age > 30 ? "Tutup: Ghosting?" : "Tunggu keputusan";
        },
      },
    ],
  },
  {
    key: "blast",
    table: "wa_blasts",
    label: "WA Blast",
    singular: "Blast",
    description: "Laporan broadcast/blast WhatsApp: terkirim, dibaca, dibalas, leads, deal & biaya.",
    dateField: "blast_date",
    titleField: "campaign_name",
    importKeys: ["campaign_name", "sent"],
    sheetHints: ["blast", "broadcast"],
    defaultSort: "blast_date",
    fields: [
      { key: "blast_date", label: "Tanggal", type: "date", required: true },
      { key: "brand", label: "Brand", type: "brand", required: true },
      { key: "campaign_name", label: "Nama Blast", type: "text", required: true, aliases: ["campaign", "judul"] },
      { key: "audience", label: "Segmen Audiens", type: "text", aliases: ["target", "segmen"] },
      { key: "tool", label: "Tools", type: "select", options: "blast_tool", hideInTable: true },
      { key: "message", label: "Isi Pesan / Template", type: "longtext", hideInTable: true },
      { key: "total_target", label: "Target Kontak", type: "number", hideInTable: true },
      { key: "sent", label: "Terkirim", type: "number", aliases: ["sent"] },
      { key: "delivered", label: "Delivered", type: "number", aliases: ["diterima"] },
      { key: "read_count", label: "Dibaca", type: "number", aliases: ["read", "dibaca"] },
      { key: "replied", label: "Dibalas", type: "number", aliases: ["reply", "balasan"] },
      { key: "failed", label: "Gagal", type: "number", hideInTable: true },
      { key: "leads", label: "Leads", type: "number" },
      { key: "deals", label: "Deal", type: "number" },
      { key: "revenue", label: "Omzet", type: "money", hideInTable: true },
      { key: "cost", label: "Biaya", type: "money" },
      { key: "status", label: "Status", type: "select", options: "blast_status", hideInTable: true },
    ],
    computed: [
      { key: "delivery_rate", label: "Delivery", format: "percent", fn: (r) => div(n(r.delivered), n(r.sent)) },
      { key: "read_rate", label: "Read Rate", format: "percent", fn: (r) => div(n(r.read_count), n(r.delivered) || n(r.sent)) },
      { key: "reply_rate", label: "Reply Rate", format: "percent", fn: (r) => div(n(r.replied), n(r.delivered) || n(r.sent)) },
      { key: "cpl", label: "Biaya/Lead", format: "money", fn: (r) => div(n(r.cost), n(r.leads)) },
    ],
  },
  {
    key: "contacts",
    table: "blast_contacts",
    label: "Kontak Blast",
    singular: "Kontak",
    description: "Database target WA Blast (format kontrak pembiayaan): nomor kontrak, nama, nomor resmi 62, harga pasar, plafon, pinjaman, rekomendasi plafon, tipe unit & tahun, plus status hasil blast.",
    dateField: "blast_date",
    titleField: "name",
    importKeys: ["contract_no", "name", "phone_official", "phone"],
    sheetHints: ["kontak blast", "data blast", "target blast", "database blast", "contacts"],
    defaultSort: "blast_date",
    upsertKeys: ["contract_no"],
    preserveOnReimport: ["status", "batch", "notes", "blast_date", "brand"],
    fields: [
      { key: "blast_date", label: "Tanggal Blast", type: "date", required: true, group: "Blast", aliases: ["tanggal kirim"] },
      { key: "batch", label: "Nama Blast / Batch", type: "text", group: "Blast", aliases: ["batch", "nama blast"] },
      { key: "brand", label: "Brand", type: "brand", required: true, group: "Blast" },
      { key: "blast", label: "Blast", type: "select", options: "yes_no_en", group: "Blast", aliases: ["blast?", "kirim"] },
      { key: "status", label: "Status Blast", type: "select", options: "contact_status", group: "Blast" },
      { key: "contract_no", label: "Nomor Kontrak", type: "text", group: "Data Konsumen", aliases: ["nomor kontrak", "no kontrak", "no. kontrak", "contract"] },
      { key: "name", label: "Nama", type: "text", required: true, group: "Data Konsumen", aliases: ["nama", "nama konsumen"] },
      { key: "phone", label: "Nomor", type: "phone", group: "Data Konsumen", hideInTable: true, aliases: ["nomor", "no hp", "no. hp", "hp", "no wa"] },
      { key: "phone_official", label: "No. Resmi (62)", type: "phone", group: "Data Konsumen", aliases: ["noresmi", "no resmi", "nomor resmi"] },
      { key: "unit_type", label: "Tipe Unit", type: "text", group: "Data Konsumen", aliases: ["nm_tipe", "nm tipe", "tipe", "tipe unit", "type"] },
      { key: "year", label: "Tahun", type: "text", group: "Data Konsumen", aliases: ["tahun", "thn"] },
      { key: "market_price", label: "Harga Pasar", type: "money", group: "Pembiayaan", aliases: ["harga pasar", "otr"] },
      { key: "plafon_pct", label: "Plafon", type: "percent", group: "Pembiayaan", aliases: ["plafon", "plafon %", "ltv"] },
      { key: "loan", label: "Pinjaman", type: "money", group: "Pembiayaan", aliases: ["pinjama", "pinjaman", "nilai pinjaman"] },
      { key: "recommended", label: "Rekomendasi Plafon", type: "money", group: "Pembiayaan", hideInTable: true, aliases: ["rekomendasi plafon", "rekomendasi"] },
      { key: "official_rec", label: "Rek. Resmi", type: "money", group: "Pembiayaan", aliases: ["rek resmi", "rekomendasi resmi"] },
      { key: "notes", label: "Catatan / Respon", type: "longtext", group: "Blast", hideInTable: true, aliases: ["catatan", "respon", "keterangan"] },
    ],
    derive: (r) => {
      const digits = (v: unknown) => String(v ?? "").replace(/\D/g, "");
      if (!r.phone_official && r.phone) {
        const d = digits(r.phone);
        r.phone_official = d.startsWith("0") ? "62" + d.slice(1) : d.startsWith("8") ? "62" + d : d;
      }
      if (!r.phone && r.phone_official) {
        const d = digits(r.phone_official);
        r.phone = d.startsWith("62") ? "0" + d.slice(2) : d;
      }
      if ((r.loan === null || r.loan === undefined) && n(r.market_price) && n(r.plafon_pct)) r.loan = Math.round(n(r.market_price) * n(r.plafon_pct));
      if ((r.recommended === null || r.recommended === undefined) && n(r.loan)) r.recommended = Math.floor(n(r.loan) / 500000) * 500000;
      if ((r.official_rec === null || r.official_rec === undefined) && n(r.recommended)) r.official_rec = r.recommended;
      if (!r.blast) r.blast = "yes";
      return r;
    },
    computed: [
      { key: "ltv", label: "Pinjaman/Harga", format: "percent", fn: (r) => div(n(r.loan), n(r.market_price)) },
    ],
  },
  {
    key: "reviews",
    table: "reviews",
    label: "Google Business",
    singular: "Ulasan",
    description: "Ulasan Google Maps per cabang: rating, sentimen, kategori, dan respon admin.",
    dateField: "review_date",
    titleField: "reviewer",
    importKeys: ["review_date", "reviewer"],
    sheetHints: ["google business", "ulasan", "review"],
    defaultSort: "review_date",
    fields: [
      { key: "review_date", label: "Tanggal Ulasan", type: "date", required: true },
      { key: "brand", label: "Brand", type: "brand", required: true },
      { key: "branch", label: "Cabang", type: "select", options: "branch", aliases: ["lokasi cabang"] },
      { key: "reviewer", label: "Nama Pengulas", type: "text" },
      { key: "rating", label: "Rating", type: "rating", required: true, aliases: ["rating⭐"] },
      { key: "comment", label: "Komentar", type: "longtext", aliases: ["komentar / review"] },
      { key: "responded", label: "Dibalas", type: "select", options: "yes_no", aliases: ["respon admin (ya/tidak)", "respon admin"] },
      { key: "sentiment", label: "Sentimen", type: "select", options: "sentiment", aliases: ["jenis ulasan"] },
      { key: "category", label: "Kategori", type: "select", options: "review_category", aliases: ["kategori komentar"] },
      { key: "follow_up", label: "Tindak Lanjut", type: "longtext", hideInTable: true, aliases: ["tindak lanjut / catatan"] },
    ],
  },
  {
    key: "review_stats",
    table: "review_stats",
    label: "Rekap Ulasan Google",
    singular: "Rekap Ulasan",
    description: "Catat berkala jumlah total ulasan & rating Google Maps per cabang. Isian pertama = jumlah awal; berikutnya membentuk riwayat dan perkembangan.",
    dateField: "snapshot_date",
    titleField: "branch",
    importKeys: ["total_reviews"],
    sheetHints: ["rekap ulasan", "google rekap"],
    defaultSort: "snapshot_date",
    upsertKeys: ["brand", "branch", "snapshot_date"],
    fields: [
      { key: "snapshot_date", label: "Tanggal", type: "date", required: true },
      { key: "brand", label: "Brand", type: "brand", required: true },
      { key: "branch", label: "Cabang", type: "select", options: "branch" },
      { key: "total_reviews", label: "Total Ulasan", type: "number", required: true, aliases: ["jumlah ulasan", "total ulasan"] },
      { key: "avg_rating", label: "Rating Rata-rata", type: "rating", aliases: ["rating"] },
      { key: "notes", label: "Catatan (mis. jumlah awal)", type: "text" },
    ],
  },
  {
    key: "influencers",
    table: "influencer_campaigns",
    label: "Influencer & Endorse",
    singular: "Kerjasama",
    description: "Kerjasama KOL/influencer: fee, deliverable, performa konten dan hasil penjualan.",
    dateField: "post_date",
    titleField: "influencer",
    importKeys: ["influencer"],
    sheetHints: ["influencer", "endorse", "kol"],
    defaultSort: "post_date",
    fields: [
      { key: "post_date", label: "Tanggal Tayang", type: "date", required: true },
      { key: "brand", label: "Brand", type: "brand", required: true },
      { key: "influencer", label: "Nama Influencer", type: "text", required: true, aliases: ["nama", "kol"] },
      { key: "platform", label: "Platform", type: "select", options: "content_channel" },
      { key: "followers", label: "Followers", type: "number" },
      { key: "deal_type", label: "Jenis Kerjasama", type: "select", options: "influencer_type" },
      { key: "fee", label: "Fee", type: "money" },
      { key: "content_link", label: "Link Konten", type: "url", hideInTable: true },
      { key: "views", label: "Views", type: "number" },
      { key: "engagement", label: "Engagement", type: "number", aliases: ["like+comment+share"] },
      { key: "leads", label: "Leads", type: "number" },
      { key: "revenue", label: "Omzet", type: "money" },
      { key: "status", label: "Status", type: "select", options: "influencer_status" },
      { key: "notes", label: "Catatan", type: "longtext", hideInTable: true },
    ],
    computed: [
      { key: "cpv", label: "Biaya/View", format: "money", fn: (r) => div(n(r.fee), n(r.views)) },
      { key: "cpe", label: "Biaya/Engagement", format: "money", fn: (r) => div(n(r.fee), n(r.engagement)) },
      { key: "roi", label: "ROI", format: "percent", fn: (r) => (n(r.fee) && n(r.revenue) ? (n(r.revenue) - n(r.fee)) / n(r.fee) : null) },
    ],
  },
];

export const RESOURCE_MAP = Object.fromEntries(RESOURCES.map((r) => [r.key, r])) as Record<string, Resource>;

export function getResource(key: string): Resource | undefined {
  return RESOURCE_MAP[key];
}

/** Default editable option lists (seeded from the original Excel template). */
export const DEFAULT_OPTIONS: Record<string, { label: string; values: string[] }> = {
  platform: { label: "Platform Iklan", values: ["Meta", "TikTok", "Google Ads", "YouTube", "Lainnya"] },
  ad_objective: { label: "Jenis Campaign", values: ["Awareness", "Traffic", "Prospek", "Engagement", "Penjualan", "Video Views", "Pesan WhatsApp"] },
  ad_status: { label: "Status Campaign", values: ["Planning", "Running", "Hold", "Done", "Nonaktif", "Cancel"] },
  content_channel: { label: "Channel Konten", values: ["Instagram Feed", "Instagram Reels", "Instagram Story", "TikTok", "Facebook", "YouTube", "Website/Blog", "LinkedIn"] },
  social_account: { label: "Akun Sosial (Followers)", values: ["Instagram", "TikTok", "Facebook", "YouTube", "LinkedIn"] },
  content_type: { label: "Jenis Konten", values: ["Single Image", "Carousel", "Video/Reels", "Story", "Live", "Artikel"] },
  content_pillar: { label: "Konten Pilar", values: ["Edukasi", "Promosi", "Engagement", "Testimoni", "Behind The Scene", "Brand Awareness", "Hiburan"] },
  content_status: { label: "Status Konten", values: ["Ide", "Draft", "Produksi", "Review", "Scheduled", "Posted", "Cancel"] },
  approval_status: { label: "Status Approval", values: ["Menunggu review", "Disetujui", "Perlu revisi"] },
  event_type: { label: "Jenis Event", values: ["Hari Besar", "Promo", "Launching", "Event Internal", "Pameran", "Lainnya"] },
  customer_type: { label: "Jenis Pelanggan", values: ["Baru", "Repeat Order", "Langganan"] },
  lead_source: { label: "Sumber Trafik", values: ["Organik", "Ads Meta", "Ads TikTok", "Google", "Whatsapp Blast", "Story WA", "Broadcast WA", "Influencer", "Referral", "Website"] },
  plan_timing: { label: "Rencana", values: ["Secepatnya", "Dalam 1 Minggu", "Dalam 2 Minggu", "Dalam 1 Bulan", "Bulan Depan", "Dalam tahun ini", "Masih belum tau"] },
  post_chat_status: {
    label: "Status Pasca Chat",
    values: [
      "Menunggu Respons", "Qualified Lead", "Tanya Informasi", "Berminat – Pertimbangan", "Berminat – Belum Mengajukan",
      "Menunggu Data/Dokumen", "Jadwal Kunjungan", "Negosiasi / Proses Transaksi", "Kendala Budget", "Dialihkan ke Marketing",
      "Tidak Memenuhi Kriteria", "Tidak Berminat", "Tidak Dapat Dihubungi",
    ],
  },
  lead_segment: { label: "Segmentasi Prospek", values: ["HOT", "WARM", "COLD"] },
  initial_status: { label: "Status Awal", values: ["Follow Up", "Deal", "Pending", "Cancel"] },
  final_status: { label: "Status Akhir", values: ["Follow-up", "Pending", "Deal", "Cancel", "Ghosting"] },
  blast_tool: { label: "Tools Blast", values: ["Scooter", "WATI", "Qontak", "WA Business", "Lainnya"] },
  blast_status: { label: "Status Blast", values: ["Draft", "Terjadwal", "Terkirim", "Gagal"] },
  contact_status: { label: "Status Kontak Blast", values: ["Belum dikirim", "Terkirim", "Dibaca", "Dibalas", "Tertarik", "Deal", "Tidak tertarik", "Nomor tidak aktif"] },
  yes_no_en: { label: "Blast (yes/no)", values: ["yes", "no"] },
  branch: { label: "Cabang", values: ["Nibung Raya", "SM Raja", "Pekanbaru", "Aceh", "Batam"] },
  yes_no: { label: "Ya/Tidak", values: ["Ya", "Tidak"] },
  sentiment: { label: "Sentimen", values: ["Positif", "Netral", "Negatif"] },
  review_category: {
    label: "Kategori Ulasan",
    values: [
      "Pelayanan", "Kecepatan Layanan", "Informasi & Komunikasi", "Proses Pengajuan", "Produk", "Harga & Biaya",
      "Fasilitas", "Profesionalisme Staf", "Keluhan / Ketidakpuasan", "Apresiasi / Kepuasan", "Administrasi & Dokumen", "Lainnya",
    ],
  },
  influencer_type: { label: "Jenis Kerjasama", values: ["Paid Endorse", "Paid Promote", "Barter", "Affiliate", "Brand Ambassador"] },
  influencer_status: { label: "Status Kerjasama", values: ["Negosiasi", "Deal", "Produksi", "Tayang", "Selesai", "Batal"] },
};

export const DEFAULT_BRANDS = ["Kembar Cafe", "Kembar Venue", "CMD Finance", "OTO CMD"];
