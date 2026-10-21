import { after } from "next/server";
import type { Session } from "./token";
import type { Resource, Row } from "./resources";
import { fmtDate, fmtMoney } from "./format";
import { notify } from "./notify";

type Action = "create" | "update" | "delete";

const show = (v: unknown, type?: string) => {
  if (v === null || v === undefined || v === "") return "–";
  if (type === "date") return fmtDate(v);
  if (type === "money") return fmtMoney(Number(v));
  if (type === "percent") return `${Math.round(Number(v) * 10000) / 100}%`;
  return String(v);
};

/** Field-level diff for an edit, as "Label: old → new" lines. */
function changes(r: Resource, old: Row, row: Row) {
  return r.fields
    .filter((f) => String(old[f.key] ?? "") !== String(row[f.key] ?? ""))
    .map((f) => ({ key: f.key, line: `${f.label}: ${show(old[f.key], f.type)} → ${show(row[f.key], f.type)}` }));
}

function contentRows(r: Resource, row: Row): [string, string][] {
  const keys = ["title", "post_date", "post_time", "brand", "channel", "content_type", "pillar", "pic", "status", "approval_status", "caption", "approval_note"];
  return keys
    .map((k) => r.fields.find((f) => f.key === k)!)
    .filter((f) => f && row[f.key] !== null && row[f.key] !== undefined && row[f.key] !== "")
    .map((f) => [f.label, show(row[f.key], f.type)]);
}

/**
 * Called by the data routes after a record changes. Work runs after the response is sent,
 * so saving never waits on email delivery.
 */
export function recordEvent(e: { s: Session; r: Resource; action: Action; row?: Row | null; old?: Row | null; req?: Request }) {
  after(async () => {
    try {
      await handleEvent(e);
    } catch (err) {
      console.error("notify failed", err);
    }
  });
}

async function handleEvent({ s, r, action, row, old, req }: { s: Session; r: Resource; action: Action; row?: Row | null; old?: Row | null; req?: Request }) {
  const actor = { uid: s.uid, name: s.name };
  if (r.key === "content") {
    const cur = (row ?? old)!;
    const title = String(cur.title ?? "Tanpa judul");
    const when = `${fmtDate(cur.post_date)}${cur.post_time ? ` ${cur.post_time}` : ""}`;
    if (action === "create") {
      const needsReview = cur.approval_status === "Menunggu review";
      return notify({
        orgId: s.org, category: "content", actor, req, link: "/content",
        title: needsReview ? `Butuh review: "${title}"` : `Rencana konten baru: "${title}"`,
        body: `${s.name} menambahkan ${cur.channel ?? "konten"} untuk ${when}${cur.brand ? ` · ${cur.brand}` : ""}.`,
        email: { subject: `[Content Plan] ${needsReview ? "Butuh review" : "Rencana baru"}: ${title}`, eyebrow: "Content plan · rencana baru", sections: [{ title: "Detail rencana", rows: contentRows(r, cur) }], ctaLabel: "Lihat content plan" },
      });
    }
    if (action === "delete") {
      return notify({
        orgId: s.org, category: "content", actor, req, link: "/content",
        title: `Rencana konten dihapus: "${title}"`,
        body: `${s.name} menghapus konten ${cur.channel ?? ""} yang dijadwalkan ${when}.`,
        email: { subject: `[Content Plan] Dihapus: ${title}`, eyebrow: "Content plan · dihapus", sections: [{ title: "Konten yang dihapus", rows: contentRows(r, cur) }] },
      });
    }
    if (!old || !row) return;
    const diff = changes(r, old, row);
    if (!diff.length) return;
    const approvalChanged = diff.some((d) => d.key === "approval_status");
    const onlyResults = diff.every((d) => r.fields.find((f) => f.key === d.key)?.group === "Hasil");
    let headline = `Rencana konten diubah: "${title}"`;
    if (approvalChanged && row.approval_status === "Disetujui") headline = `Disetujui: "${title}"`;
    else if (approvalChanged && row.approval_status === "Perlu revisi") headline = `Perlu revisi: "${title}"`;
    else if (approvalChanged && row.approval_status === "Menunggu review") headline = `Butuh review: "${title}"`;
    else if (diff.some((d) => d.key === "status") && row.status === "Posted") headline = `Sudah tayang: "${title}"`;
    else if (onlyResults) headline = `Hasil konten diperbarui: "${title}"`;
    return notify({
      orgId: s.org, category: onlyResults ? "activity" : "content", actor, req, link: "/content",
      title: headline,
      body: `${s.name} mengubah ${diff.length} kolom: ${diff.slice(0, 3).map((d) => d.line).join("; ")}${diff.length > 3 ? "; …" : ""}`,
      email: {
        subject: `[Content Plan] ${headline}`,
        eyebrow: "Content plan · perubahan",
        intro: `${s.name} memperbarui konten untuk ${when}.`,
        sections: [
          { title: "Yang berubah", items: diff.map((d) => d.line) },
          { title: "Detail terbaru", rows: contentRows(r, row) },
        ],
      },
    });
  }

  if (r.key === "leads" && action === "create" && row && String(row.segment ?? "").toUpperCase() === "HOT") {
    return notify({
      orgId: s.org, category: "alerts", actor, req, link: "/leads/followup",
      title: `Lead HOT baru: ${row.name ?? row.phone ?? "tanpa nama"}`,
      body: `${row.source ?? "Sumber belum diisi"}${row.need ? ` · ${row.need}` : ""}. Hubungi secepatnya.`,
      email: {
        subject: `[Lead HOT] ${row.name ?? row.phone ?? "Lead baru"}`,
        eyebrow: "WA Leads · HOT",
        sections: [{ title: "Detail lead", rows: [["Nama", show(row.name)], ["No. WhatsApp", show(row.phone)], ["Brand", show(row.brand)], ["Sumber", show(row.source)], ["Kebutuhan", show(row.need)]] }],
        ctaLabel: "Buka papan follow up",
      },
    });
  }
}

/** Summary notification for bulk work (imports, bulk edits, conversions). */
export function activityEvent(s: Session, title: string, body: string, link: string, category: "activity" | "content" = "activity", req?: Request) {
  after(async () => {
    try {
      await notify({ orgId: s.org, category, actor: { uid: s.uid, name: s.name }, req, link, title, body, email: { subject: `[Ads Manager] ${title}`, eyebrow: "Aktivitas tim" } });
    } catch (err) {
      console.error("notify failed", err);
    }
  });
}
