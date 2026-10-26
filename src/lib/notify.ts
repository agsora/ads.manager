import { q } from "./db";
import { appUrl, emailEnabled, renderEmail, sendEmails, type EmailSection } from "./email";

/** Email categories a user can switch off. In-app notifications are always kept. */
export const CATEGORIES = {
  content: { label: "Content plan", desc: "Rencana konten baru, diedit, dihapus, approval & revisi, dan pengingat cek performa tiap 7 hari setelah tayang", emailDefault: true },
  alerts: { label: "Peringatan penting", desc: "Lead HOT baru, konten terlewat jadwal, saldo iklan menipis, ulasan negatif", emailDefault: true },
  digest: { label: "Ringkasan harian (08.00 WIB)", desc: "Jadwal konten hari ini, approval tertunda, follow up jatuh tempo, insight kritis", emailDefault: true },
  weekly: { label: "Laporan mingguan (Senin)", desc: "Ringkasan 7 hari + lampiran Excel laporan lengkap", emailDefault: true },
  activity: { label: "Aktivitas tim", desc: "Impor data, upload laporan Meta, kontak blast dijadikan leads", emailDefault: false },
} as const;
export type Category = keyof typeof CATEGORIES;

export interface Recipient {
  id: number;
  name: string;
  email: string;
  role: string;
  notify_prefs: Record<string, boolean>;
}

export async function orgUsers(orgId: number) {
  return q<Recipient>(`SELECT id, name, email, role, notify_prefs FROM users WHERE org_id = $1`, [orgId]);
}

export const wantsEmail = (u: Recipient, c: Category) => {
  const v = u.notify_prefs?.[`email_${c}`];
  return v === undefined ? CATEGORIES[c].emailDefault : !!v;
};

export interface NotifyInput {
  orgId: number;
  category: Category;
  title: string;
  body?: string;
  /** path inside the app, e.g. /content */
  link?: string;
  actor?: { uid?: number; name: string };
  /** skip the person who triggered it (default true) */
  skipActor?: boolean;
  /** only these users (default: everyone in the workspace) */
  userIds?: number[];
  email?: { subject: string; eyebrow?: string; intro?: string; sections?: EmailSection[]; ctaLabel?: string };
  req?: Request;
}

/** Fan out an in-app notification to every user of the workspace and email those who opted in. */
export async function notify(n: NotifyInput) {
  let users = await orgUsers(n.orgId);
  if (n.userIds) users = users.filter((u) => n.userIds!.includes(u.id));
  if (n.skipActor !== false && n.actor?.uid) users = users.filter((u) => u.id !== n.actor!.uid);
  if (!users.length) return { inApp: 0, emailed: 0 };

  const params: unknown[] = [];
  const tuples = users.map((u) => {
    params.push(n.orgId, u.id, n.category, n.title, n.body ?? null, n.link ?? null, n.actor?.name ?? null);
    const b = params.length - 7;
    return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7})`;
  });
  await q(`INSERT INTO notifications (org_id, user_id, category, title, body, link, actor) VALUES ${tuples.join(",")}`, params);

  let emailed = 0;
  if (n.email && emailEnabled()) {
    const base = appUrl(n.req);
    const html = renderEmail({
      eyebrow: n.email.eyebrow,
      title: n.title,
      intro: n.email.intro ?? n.body,
      sections: n.email.sections,
      cta: n.link ? { label: n.email.ctaLabel ?? "Buka di Ads Manager", url: base + n.link } : undefined,
    });
    const res = await sendEmails(users.filter((u) => wantsEmail(u, n.category)).map((u) => ({ to: u.email, subject: n.email!.subject, html })));
    emailed = res.sent;
  }
  return { inApp: users.length, emailed };
}
