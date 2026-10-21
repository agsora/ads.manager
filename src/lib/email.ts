/** Minimal Resend client + one warm, table-based email layout that renders in Gmail/Outlook. */

export interface Mail {
  to: string;
  subject: string;
  html: string;
  attachments?: { filename: string; content: string }[]; // base64
}

export const emailEnabled = () => !!process.env.RESEND_API_KEY;

export function appUrl(req?: Request) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  if (req) {
    const h = req.headers;
    const host = h.get("x-forwarded-host") ?? h.get("host");
    if (host) return `${h.get("x-forwarded-proto") ?? "https"}://${host}`;
  }
  return "https://ads-manager-beryl.vercel.app";
}

/** Sends each mail separately (recipients never see each other). Returns how many were accepted. */
export async function sendEmails(mails: Mail[]): Promise<{ sent: number; error?: string }> {
  const key = process.env.RESEND_API_KEY;
  if (!key || !mails.length) return { sent: 0, error: key ? undefined : "RESEND_API_KEY belum di-set" };
  const from = process.env.EMAIL_FROM || "Ads Manager <onboarding@resend.dev>";
  let sent = 0;
  let error: string | undefined;
  const withFiles = mails.filter((m) => m.attachments?.length);
  const plain = mails.filter((m) => !m.attachments?.length);
  // batch endpoint (max 100, no attachments)
  for (let i = 0; i < plain.length; i += 100) {
    const chunk = plain.slice(i, i + 100).map((m) => ({ from, to: [m.to], subject: m.subject, html: m.html }));
    const r = await fetch("https://api.resend.com/emails/batch", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(chunk),
    });
    if (r.ok) {
      sent += chunk.length;
      continue;
    }
    error = await r.text().catch(() => `HTTP ${r.status}`);
    // one rejected address fails the whole batch: retry one by one so the rest still get it
    for (const m of chunk) {
      const one = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify(m),
      });
      if (one.ok) sent++;
      else error = await one.text().catch(() => `HTTP ${one.status}`);
    }
  }
  for (const m of withFiles) {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [m.to], subject: m.subject, html: m.html, attachments: m.attachments }),
    });
    if (r.ok) sent++;
    else error = await r.text().catch(() => `HTTP ${r.status}`);
  }
  if (error) console.error("Resend:", error);
  return { sent, error };
}

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export interface EmailSection {
  title: string;
  rows?: [string, string][]; // label, value
  items?: string[]; // bullet lines (plain text)
  empty?: string;
}

/** Renders the shared email layout. All text is escaped. */
export function renderEmail(o: { eyebrow?: string; title: string; intro?: string; sections?: EmailSection[]; cta?: { label: string; url: string }; footer?: string }) {
  const section = (s: EmailSection) => `
    <tr><td style="padding:20px 0 6px;font-family:Georgia,'Times New Roman',serif;font-size:17px;color:#1f1e1d">${esc(s.title)}</td></tr>
    ${
      s.rows?.length
        ? `<tr><td><table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px">${s.rows
            .map(
              ([k, v]) =>
                `<tr><td style="padding:7px 12px 7px 0;color:#8a8880;border-bottom:1px solid #eeebe3;width:38%;vertical-align:top">${esc(k)}</td><td style="padding:7px 0;color:#1f1e1d;border-bottom:1px solid #eeebe3">${esc(v)}</td></tr>`,
            )
            .join("")}</table></td></tr>`
        : ""
    }
    ${
      s.items?.length
        ? `<tr><td style="font-size:14px;color:#1f1e1d;line-height:1.6">${s.items.map((i) => `<div style="padding:6px 0;border-bottom:1px solid #eeebe3">${esc(i)}</div>`).join("")}</td></tr>`
        : ""
    }
    ${!s.rows?.length && !s.items?.length && s.empty ? `<tr><td style="font-size:14px;color:#8a8880;padding:4px 0">${esc(s.empty)}</td></tr>` : ""}`;
  return `<!doctype html><html><body style="margin:0;background:#faf9f5;padding:24px 12px;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid #e5e2d8;border-radius:12px">
    <tr><td style="padding:22px 28px 0">
      <table cellpadding="0" cellspacing="0"><tr>
        <td style="background:#c96442;color:#fff;font-family:Georgia,serif;font-style:italic;font-size:16px;width:26px;height:26px;text-align:center;border-radius:6px">a</td>
        <td style="padding-left:9px;font-family:Georgia,serif;font-size:17px;color:#1f1e1d">Ads Manager</td>
      </tr></table>
    </td></tr>
    <tr><td style="padding:22px 28px 26px">
      <table width="100%" cellpadding="0" cellspacing="0">
        ${o.eyebrow ? `<tr><td style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#8a8880;font-weight:600">${esc(o.eyebrow)}</td></tr>` : ""}
        <tr><td style="padding-top:6px;font-family:Georgia,'Times New Roman',serif;font-size:24px;line-height:1.25;color:#1f1e1d">${esc(o.title)}</td></tr>
        ${o.intro ? `<tr><td style="padding-top:10px;font-size:14px;line-height:1.6;color:#5e5d59">${esc(o.intro)}</td></tr>` : ""}
        ${(o.sections ?? []).map(section).join("")}
        ${
          o.cta
            ? `<tr><td style="padding-top:24px"><a href="${esc(o.cta.url)}" style="display:inline-block;background:#1f1e1d;color:#faf9f5;text-decoration:none;font-size:14px;font-weight:600;padding:11px 18px;border-radius:8px">${esc(o.cta.label)}</a></td></tr>`
            : ""
        }
      </table>
    </td></tr>
  </table>
  <div style="max-width:600px;font-size:12px;color:#8a8880;padding:14px 4px;line-height:1.5">${esc(o.footer ?? "Anda menerima email ini karena terdaftar di Ads Manager. Atur notifikasi di menu Notifikasi.")}</div>
  </td></tr></table></body></html>`;
}
