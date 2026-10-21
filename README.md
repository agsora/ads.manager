# Ads Manager — Dashboard Digital Marketing (SaaS)

Dashboard multi-workspace untuk memonitor seluruh aktivitas digital marketing — iklan, content plan, WA leads, WA blast, Google Business review dan influencer — lengkap dengan **insight & rekomendasi otomatis**, laporan, serta impor/ekspor Excel.

Dibangun dari struktur workbook *WEBSITE MARKETING REPORT.xlsx* (Ads Report, Content Plan, WA Leads, WA Blast, Google Business Report).

## Fitur

| Modul | Isi |
|---|---|
| **Dashboard** | Skor kesehatan marketing, KPI vs periode lalu, tren belanja iklan & leads, funnel, sumber leads, saldo iklan, follow up jatuh tempo, konten 7 hari ke depan, progres target KPI |
| **Insight & Rekomendasi** | ±40 aturan analisis (CTR, ad fatigue, ROAS, realokasi budget, pacing, saldo menipis, conversion, ghosting, leads HOT, kualitas sumber, blast delivery/read/reply, ER konten, pilar & hari terbaik, rating & ulasan negatif, ROI influencer, event mendatang) + rencana aksi |
| **Laporan** | Ringkasan eksekutif, Iklan & Budget, Leads & Penjualan, Konten, WA Blast, Reputasi, Influencer, Atribusi & efisiensi biaya — cetak/PDF dan Excel multi-sheet |
| **Ads Campaign** | Upload langsung file ekspor Meta Ads Manager (CSV/Excel, termasuk breakdown harian) — kolom dikenali otomatis, digabung per campaign, upload ulang tidak dobel dan omzet yang diisi manual tetap tersimpan. CTR, CPC, CPM, biaya/percakapan, ROAS, ROI otomatis |
| **Saldo & Top Up** | Saldo terbawa antar bulan: saldo akhir = saldo awal + top up − belanja iklan nyata, dan jadi saldo awal bulan berikutnya; riwayat per bulan, belanja/hari, estimasi hari tersisa |
| **Content Plan** | Kalender + event; tab **Planning** (jadwal, PIC, caption, approval: menunggu review/disetujui/revisi) terpisah dari tab **Hasil** (tanggal aktual, reach, like, comment, saved, followers → ER); analitik per channel/pilar/hari; angka reach/views/like/comment/share/save bisa ditarik dari link (TikTok & YouTube langsung; Instagram via Graph API: `IG_ACCESS_TOKEN`, `IG_USER_ID`), dan diperbarui otomatis tiap hari |
| **Notifikasi** | Lonceng + email (Resend) ke semua user saat rencana konten baru/diubah/dihapus/disetujui, lead HOT baru, impor data; atur email per kategori. Otomasi 08.00 WIB: tutup campaign lewat tanggal, peringatan, ringkasan harian, laporan mingguan + Excel (Senin) |
| **Target KPI / Followers / Event** | Target bulanan per brand, tracker followers, tanggal penting |
| **WA Leads & Follow Up** | CRM chat masuk (sumber, segmen HOT/WARM/COLD, FU 1–3, status akhir, nilai deal) + papan follow up H+3/H+7/H+14 dengan template pesan WA (bisa diubah di Pengaturan). **Atribusi:** pembuat link WA bertanda kode campaign → leads, deal, biaya/lead, ROAS per campaign |
| **WA Blast** | *Kontak blast* format kontrak (nomor kontrak, nama, nomor, noresmi 62…, harga pasar, plafon, pinjaman, rekomendasi plafon, rek. resmi, tipe unit, tahun): upload, ekspor CSV siap kirim dengan pesan personal, status per kontak, rekap per batch & tipe unit, konversi ke WA Leads. *Laporan kampanye*: terkirim → dibaca → dibalas → leads → deal |
| **Google Business** | Rekap berkala jumlah ulasan & rating per cabang (isian pertama = jumlah awal) dengan grafik perkembangan; ulasan satu per satu untuk sentimen, kategori, response rate |
| **Influencer** | Fee, views, engagement, leads, omzet → biaya/engagement & ROI |
| **Impor / Ekspor** | Impor workbook lengkap (deteksi sheet & kolom otomatis, pratinjau), impor per modul (.xlsx/.csv), template Excel dengan dropdown, ekspor Excel/CSV, backup seluruh data |
| **Superadmin** | Akun pertama otomatis Superadmin: kelola semua workspace & user, reset password, ubah role, buka workspace mana pun, buka/tutup pendaftaran publik |
| **File & Google Drive** | Upload desain/creative dari kalender konten, campaign iklan, influencer, event → otomatis rapi di Drive: Brand / Campaign / jenis file. Status konten otomatis "Desain Selesai" + notifikasi review. Arsip file impor & laporan mingguan juga masuk Drive. Perlu Apps Script (panduan di menu File & Drive): `DRIVE_SCRIPT_URL`, `DRIVE_SCRIPT_SECRET`, `DRIVE_FOLDER_ID` |
| **Pencarian global** | Ctrl+K: lead, nomor, kontrak, campaign, konten, ulasan, influencer, event |
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

Buka http://localhost:3000/register untuk membuat akun pertama — akun ini menjadi **Superadmin**. Setelah itu pendaftaran tertutup (bisa dibuka dari halaman Superadmin); user lain dibuat dari Pengaturan atau Superadmin. Di dashboard kosong ada tombol **Isi data contoh** untuk mencoba semua fitur.

## Environment variables

| Nama | Keterangan |
|---|---|
| `DATABASE_URL` | Connection string Neon (pooled) |
| `AUTH_SECRET` | String acak ≥ 32 karakter untuk menandatangani sesi |
| `RESEND_API_KEY` | Kunci Resend untuk email notifikasi |
| `EMAIL_FROM` | Pengirim, mis. `Ads Manager <notif@domain-anda.com>` (wajib domain terverifikasi agar bisa kirim ke semua user) |
| `CRON_SECRET` | Rahasia untuk cron harian Vercel |
| `APP_URL` | URL aplikasi untuk tautan di email |

## Deploy

Vercel (framework Next.js). Set `DATABASE_URL` dan `AUTH_SECRET` di Project Settings → Environment Variables.
