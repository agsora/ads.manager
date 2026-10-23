/**
 * Wording check for financing promotions. These are warnings, not legal advice: they flag phrases that commonly
 * conflict with OJK consumer-protection rules for financing marketing (absolute guarantees, hidden costs,
 * misleading rates) so a person can re-read the text before it goes out.
 */
export interface ComplianceIssue {
  id: string;
  level: "high" | "medium";
  found: string;
  why: string;
  fix: string;
}

const RULES: { id: string; re: RegExp; level: "high" | "medium"; why: string; fix: string }[] = [
  { id: "guarantee", re: /\b(pasti|dijamin|garansi|100\s*%)\s*(cair|disetujui|approve|acc|lolos)\b|\bpasti\s+(acc|cair)\b/gi, level: "high", why: "Menjanjikan persetujuan padahal keputusan tergantung analisis kredit.", fix: "Gunakan “proses cepat, syarat dan ketentuan berlaku”." },
  { id: "nosurvey", re: /\btanpa\s+(survei|survey|slik|bi\s*checking|cek\s*bi|verifikasi|analisa|analisis)\b|\bbebas\s+(slik|bi\s*checking)\b/gi, level: "high", why: "Meniadakan proses penilaian kredit yang wajib dilakukan.", fix: "Sebutkan “proses survei singkat”." },
  { id: "nocost", re: /\b(tanpa|bebas|gratis)\s+(biaya|admin|administrasi|provisi|denda)\b/gi, level: "high", why: "Klaim tanpa biaya bisa menyesatkan bila ada biaya lain.", fix: "Cantumkan rincian biaya atau tulis “biaya sesuai ketentuan”." },
  { id: "zerorate", re: /\bbunga\s*(0\s*%|nol\b|rendah\s+banget\b|super\s+rendah\b|termurah\b)|\b0\s*%\s*(bunga|flat)\b/gi, level: "high", why: "Klaim bunga yang tidak disertai dasar perhitungan dan syarat.", fix: "Tulis angka resmi beserta jenis bunga (flat/efektif) dan syaratnya." },
  { id: "superlative", re: /\b(termurah|terbaik|nomor\s*(1|satu)|paling\s+(murah|cepat|mudah|aman))\b/gi, level: "medium", why: "Klaim superlatif yang tidak dapat dibuktikan.", fix: "Ganti dengan fakta terukur, misalnya “proses mulai 1 hari kerja”." },
  { id: "urgency", re: /\b(hari\s+ini\s+(saja|terakhir)|buruan|jangan\s+sampai\s+kehabisan|kesempatan\s+terakhir)\b/gi, level: "medium", why: "Menekan calon nasabah mengambil keputusan terburu-buru.", fix: "Beri informasi periode promo yang jelas." },
  { id: "easy", re: /\b(syarat\s+(super\s+)?(mudah|gampang)|tanpa\s+ribet|tanpa\s+syarat)\b/gi, level: "medium", why: "Menyederhanakan syarat secara berlebihan.", fix: "Sebut dokumen yang dibutuhkan, misalnya KTP dan BPKB." },
];

const DISCLAIMER = /(syarat\s+(dan|&)\s+ketentuan|s\s*&\s*k|terdaftar\s+dan\s+diawasi|diawasi\s+(oleh\s+)?ojk|berizin)/i;

export function checkCompliance(text: string): { issues: ComplianceIssue[]; missingDisclaimer: boolean } {
  const issues: ComplianceIssue[] = [];
  for (const r of RULES) {
    r.re.lastIndex = 0;
    const seen = new Set<string>();
    for (const m of text.matchAll(r.re)) {
      const found = m[0].trim();
      if (seen.has(found.toLowerCase())) continue;
      seen.add(found.toLowerCase());
      issues.push({ id: r.id, level: r.level, found, why: r.why, fix: r.fix });
    }
  }
  // a promo that mentions money terms should say it is subject to terms and that the company is supervised
  const promo = /\b(promo|diskon|cicilan|angsuran|bunga|dana|pinjaman|pembiayaan|cair)\b/i.test(text);
  return { issues, missingDisclaimer: promo && text.trim().length > 60 && !DISCLAIMER.test(text) };
}
