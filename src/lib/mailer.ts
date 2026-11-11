import nodemailer, { type Transporter } from "nodemailer";

/**
 * Pengiriman email satu penerima (kode OTP, dll).
 *   1) SMTP (mis. Gmail): SMTP_USER + SMTP_PASS (App Password 16 karakter), opsional SMTP_HOST, SMTP_PORT, MAIL_FROM
 *   2) Resend: RESEND_API_KEY (+ EMAIL_FROM)
 * Tanpa keduanya, saat development email dicetak ke konsol server; di produksi pengiriman tidak tersedia.
 */
const g = globalThis as unknown as { __mailer?: Transporter };

export type MailKind = "smtp" | "resend" | "console" | null;

export function mailKind(): MailKind {
  if (process.env.SMTP_USER && process.env.SMTP_PASS) return "smtp";
  if (process.env.RESEND_API_KEY) return "resend";
  return process.env.NODE_ENV === "production" ? null : "console";
}

function transporter() {
  if (!g.__mailer) {
    const port = Number(process.env.SMTP_PORT ?? 465);
    g.__mailer = nodemailer.createTransport({
      host: process.env.SMTP_HOST ?? "smtp.gmail.com",
      port,
      secure: port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS?.replace(/\s+/g, "") },
    });
  }
  return g.__mailer;
}

/** Kegagalan kirim email dengan penjelasan singkat yang aman ditampilkan (tanpa kredensial) supaya penyebabnya mudah dicari. */
export class MailError extends Error {}

function explain(kind: MailKind, e: unknown, status?: number, body?: string): string {
  const code = (e as { code?: string } | undefined)?.code ?? "";
  if (kind === "smtp") {
    if (code === "EAUTH") return "Gmail menolak SMTP_USER/SMTP_PASS. Pakai App Password 16 karakter (bukan password biasa) dan aktifkan verifikasi 2 langkah.";
    if (["ECONNECTION", "ETIMEDOUT", "ESOCKET", "EDNS"].includes(code)) return "Tidak bisa terhubung ke server SMTP (cek SMTP_HOST dan SMTP_PORT).";
    if (code === "EENVELOPE") return "Alamat email penerima ditolak server SMTP.";
    return `Server SMTP menolak pengiriman${code ? ` (${code})` : ""}.`;
  }
  if (status === 401 || status === 400 && /api key/i.test(body ?? "")) return "RESEND_API_KEY tidak valid.";
  if (status === 403 || status === 422) return "Resend menolak: domain pengirim belum diverifikasi, jadi hanya bisa mengirim ke email pemilik akun Resend. Verifikasi domain di Resend dan isi EMAIL_FROM, atau pakai SMTP.";
  return `Resend menolak pengiriman${status ? ` (HTTP ${status})` : ""}.`;
}

export async function sendMailOne(m: { to: string; subject: string; html: string; text: string }) {
  const kind = mailKind();
  if (kind === "smtp") {
    try {
      await transporter().sendMail({ from: process.env.MAIL_FROM ?? `"Ads Manager" <${process.env.SMTP_USER}>`, to: m.to, subject: m.subject, html: m.html, text: m.text });
    } catch (e) {
      console.error("[mail] SMTP gagal:", (e as Error).message);
      throw new MailError(explain("smtp", e));
    }
  } else if (kind === "resend") {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.EMAIL_FROM || "Ads Manager <onboarding@resend.dev>", to: [m.to], subject: m.subject, html: m.html, text: m.text }),
    });
    if (!r.ok) {
      const body = await r.text().catch(() => "");
      console.error("[mail] Resend gagal:", r.status, body);
      throw new MailError(explain("resend", null, r.status, body));
    }
  } else if (kind === "console") {
    console.info(`\n[mail:dev] Kepada: ${m.to}\n[mail:dev] Subjek: ${m.subject}\n${m.text}\n`);
  } else {
    throw new Error("Pengiriman email belum diatur (SMTP_USER/SMTP_PASS atau RESEND_API_KEY)");
  }
}
