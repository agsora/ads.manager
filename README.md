# Ads Manager — Dashboard Digital Marketing (SaaS)

Dashboard multi-workspace untuk memonitor seluruh aktivitas digital marketing — iklan, content plan, WA leads, WA blast, Google Business review dan influencer — lengkap dengan **insight & rekomendasi otomatis**, laporan, serta impor/ekspor Excel.

Dibangun dari struktur workbook *WEBSITE MARKETING REPORT.xlsx* (Ads Report, Content Plan, WA Leads, WA Blast, Google Business Report).

## Fitur

| Modul | Isi |
|---|---|
| **Dashboard** | Skor kesehatan marketing, KPI vs periode lalu, tren belanja iklan & leads, funnel, sumber leads, saldo iklan, follow up jatuh tempo, konten 7 hari ke depan, progres target KPI |
| **Insight & Rekomendasi** | ±40 aturan analisis (CTR, ad fatigue, ROAS, realokasi budget, pacing, saldo menipis, conversion, ghosting, leads HOT, kualitas sumber, blast delivery/read/reply, ER konten, pilar & hari terbaik, rating & ulasan negatif, ROI influencer, event mendatang) + rencana aksi |
| **Laporan** | Ringkasan eksekutif, Iklan & Budget, Leads & Penjualan, Konten, WA Blast, Reputasi, Influencer, Atribusi & efisiensi biaya — cetak/PDF dan Excel multi-sheet |
| **Ads Campaign** | Meta/TikTok/Google: jangkauan, impresi, spend, klik, percakapan, omzet → CTR, CPC, CPM, frekuensi, biaya/percakapan, ROAS, ROI otomatis |
| **Saldo & Top Up** | Saldo awal, top up, rencana top up per brand/platform/bulan → saldo akhir, belanja per hari, estimasi hari tersisa |
| **Content Plan** | Kalender bulanan + event, daftar & input hasil (like/comment/saved/followers → ER), analitik per channel/pilar/hari, top & bottom 5 |
| **Target KPI / Followers / Event** | Target bulanan per brand, tracker followers, tanggal penting |
| **WA Leads & Follow Up** | CRM chat masuk (sumber, segmen HOT/WARM/COLD, FU 1–3, status akhir, nilai deal) + papan follow up dengan jadwal H+3/H+7/H+14 |
| **WA Blast** | Terkirim → delivered → dibaca → dibalas → leads → deal, biaya per lead |
| **Google Business** | Rating per cabang, sentimen, kategori, response rate, ulasan belum dibalas |
| **Influencer** | Fee, views, engagement, leads, omzet → biaya/engagement & ROI |
| **Impor / Ekspor** | Impor workbook lengkap (deteksi sheet & kolom otomatis, pratinjau), impor per modul (.xlsx/.csv), template Excel dengan dropdown, ekspor Excel/CSV, backup seluruh data |
| **Pengaturan** | Brand, daftar pilihan dropdown (bisa diubah), user & role (owner/admin/staff), ganti password, log aktivitas, hapus data |

Semua tabel bisa diedit (klik baris → form, klik status → ubah cepat), dicari, difilter, diurutkan, dan dihapus massal. Filter brand & periode global berlaku di semua halaman.

## Teknologi

Next.js 15 (App Router) · TypeScript · Tailwind CSS 4 · Neon Postgres (`@neondatabase/serverless`) · Recharts · ExcelJS · JWT (jose) + bcrypt.

Skema database dibuat otomatis saat request pertama (`src/lib/db.ts`), diturunkan dari konfigurasi modul di `src/lib/resources.ts` — menambah kolom cukup dengan menambah field di sana lalu menaikkan `SCHEMA_VERSION`.

## Menjalankan lokal

```bash
cp .env.example .env.local   # isi DATABASE_URL (Neon) & AUTH_SECRET
npm install
npm run dev
```

Buka http://localhost:3000/register untuk membuat workspace pertama (akun pertama = Owner). Di dashboard kosong ada tombol **Isi data contoh** untuk mencoba semua fitur.

## Environment variables

| Nama | Keterangan |
|---|---|
| `DATABASE_URL` | Connection string Neon (pooled) |
| `AUTH_SECRET` | String acak ≥ 32 karakter untuk menandatangani sesi |

## Deploy

Vercel (framework Next.js). Set `DATABASE_URL` dan `AUTH_SECRET` di Project Settings → Environment Variables.
