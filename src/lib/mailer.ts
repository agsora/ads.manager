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

export async function sendMailOne(m: { to: string; subject: string; html: string; text: string }) {
  const kind = mailKind();
  if (kind === "smtp") {
    await transporter().sendMail({ from: process.env.MAIL_FROM ?? `"Ads Manager" <${process.env.SMTP_USER}>`, to: m.to, subject: m.subject, html: m.html, text: m.text });
  } else if (kind === "resend") {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.EMAIL_FROM || "Ads Manager <onboarding@resend.dev>", to: [m.to], subject: m.subject, html: m.html, text: m.text }),
    });
    if (!r.ok) throw new Error(`Resend: ${(await r.text().catch(() => "")) || r.status}`);
  } else if (kind === "console") {
    console.info(`\n[mail:dev] Kepada: ${m.to}\n[mail:dev] Subjek: ${m.subject}\n${m.text}\n`);
  } else {
    throw new Error("Pengiriman email belum diatur (SMTP_USER/SMTP_PASS atau RESEND_API_KEY)");
  }
}
