import nodemailer, { type Transporter } from "nodemailer";

/**
 * Pengiriman email kode OTP lewat Gmail SMTP.
 *   Pengirim: agsora.tech@gmail.com (bisa diganti dengan SMTP_USER)
 *   SMTP_PASS = App Password 16 karakter dari akun Gmail pengirim (Akun Google > Keamanan > Verifikasi 2 langkah > Sandi aplikasi)
 * Tanpa SMTP_PASS: saat development email dicetak ke konsol server; di produksi OTP tidak aktif (login tetap bisa pakai password).
 */
const g = globalThis as unknown as { __mailer?: Transporter };

export type MailKind = "smtp" | "console" | null;

export const SMTP_USER_DEFAULT = "agsora.tech@gmail.com";
const smtpUser = () => process.env.SMTP_USER || SMTP_USER_DEFAULT;

export function mailKind(): MailKind {
  if (process.env.SMTP_PASS) return "smtp";
  return process.env.NODE_ENV === "production" ? null : "console";
}

function transporter() {
  if (!g.__mailer) {
    const port = Number(process.env.SMTP_PORT ?? 465);
    g.__mailer = nodemailer.createTransport({
      host: process.env.SMTP_HOST ?? "smtp.gmail.com",
      port,
      secure: port === 465,
      auth: { user: smtpUser(), pass: process.env.SMTP_PASS?.replace(/\s+/g, "") },
    });
  }
  return g.__mailer;
}

/** Kegagalan kirim email dengan penjelasan singkat yang aman ditampilkan (tanpa kredensial) supaya penyebabnya mudah dicari. */
export class MailError extends Error {}

function explain(e: unknown): string {
  const code = (e as { code?: string } | undefined)?.code ?? "";
  if (code === "EAUTH") return "Gmail menolak login. SMTP_PASS harus App Password 16 karakter dari akun agsora.tech@gmail.com (bukan password biasa), dan verifikasi 2 langkah harus aktif.";
  if (["ECONNECTION", "ETIMEDOUT", "ESOCKET", "EDNS"].includes(code)) return "Tidak bisa terhubung ke server SMTP Gmail.";
  if (code === "EENVELOPE") return "Alamat email penerima ditolak.";
  return `Gmail menolak pengiriman${code ? ` (${code})` : ""}.`;
}

export async function sendMailOne(m: { to: string; subject: string; html: string; text: string }) {
  const kind = mailKind();
  if (kind === "smtp") {
    try {
      await transporter().sendMail({
        // nama pengirim yang tampil di kotak masuk: "No Reply" (ubah lewat MAIL_FROM_NAME); alamat Gmail pengirim tetap yang dipakai SMTP
        from: process.env.MAIL_FROM ?? `"${process.env.MAIL_FROM_NAME || "No Reply"}" <${smtpUser()}>`,
        to: m.to,
        subject: m.subject,
        html: m.html,
        text: m.text,
        headers: { "Auto-Submitted": "auto-generated", "X-Auto-Response-Suppress": "All" },
      });
    } catch (e) {
      console.error("[mail] SMTP gagal:", (e as Error).message);
      throw new MailError(explain(e));
    }
  } else if (kind === "console") {
    console.info(`\n[mail:dev] Kepada: ${m.to}\n[mail:dev] Subjek: ${m.subject}\n${m.text}\n`);
  } else {
    throw new Error("Pengiriman email belum diatur (SMTP_PASS)");
  }
}
