import { createHmac, randomBytes } from "node:crypto";
import { q } from "./db";

/**
 * Google Drive storage through a small Apps Script web app that runs as the Drive owner
 * (service accounts have no storage quota in a personal Drive, so they cannot upload files).
 *
 *  - Browser uploads go straight to the script with a short-lived grant signed here (HMAC),
 *    so the shared secret never leaves the server and large files skip the 4.5 MB serverless body limit.
 *  - Server-side uploads (weekly report, import archive) use the secret directly.
 */

export const MAX_UPLOAD = 25 * 1024 * 1024;

export const driveEnabled = () => !!process.env.DRIVE_SCRIPT_URL && !!process.env.DRIVE_SCRIPT_SECRET;
export const rootFolderUrl = () => (process.env.DRIVE_FOLDER_ID ? `https://drive.google.com/drive/folders/${process.env.DRIVE_FOLDER_ID}` : null);

/** Folder / file names: no slashes or control characters, bounded length. */
export const safeName = (v: unknown, fallback = "Tanpa nama") =>
  String(v ?? "")
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80) || fallback;

export function signGrant(path: string, name: string) {
  const secret = process.env.DRIVE_SCRIPT_SECRET!;
  const grant = JSON.stringify({ path, name, exp: Date.now() + 10 * 60_000, max: MAX_UPLOAD, n: randomBytes(6).toString("hex") });
  return { grant, sig: createHmac("sha256", secret).update(grant).digest("hex"), scriptUrl: process.env.DRIVE_SCRIPT_URL! };
}

export interface Uploaded {
  id: string;
  url: string;
  size: number;
  folderUrl?: string;
}

async function call(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const r = await fetch(process.env.DRIVE_SCRIPT_URL!, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ ...body, secret: process.env.DRIVE_SCRIPT_SECRET }),
    redirect: "follow",
    signal: AbortSignal.timeout(55_000),
  });
  const text = await r.text();
  try {
    const j = JSON.parse(text) as Record<string, unknown>;
    if (j.error) throw new Error(String(j.error));
    return j;
  } catch (e) {
    if (e instanceof SyntaxError) throw new Error("Respons Apps Script tidak valid (cek URL & deploy: akses harus 'Anyone')");
    throw e;
  }
}

export async function uploadFromServer(path: string, name: string, mime: string, data: Buffer): Promise<Uploaded> {
  if (!driveEnabled()) throw new Error("Google Drive belum terhubung");
  if (data.length > MAX_UPLOAD) throw new Error("File melebihi 25 MB");
  const j = await call({ action: "upload", path, name, mime, data: data.toString("base64") });
  return { id: String(j.id), url: String(j.url), size: Number(j.size ?? data.length), folderUrl: j.folderUrl ? String(j.folderUrl) : undefined };
}

export async function trashInDrive(id: string) {
  if (!driveEnabled()) return;
  await call({ action: "trash", id });
}

export async function saveFileRecord(f: {
  orgId: number;
  resource: string;
  recordId: number | null;
  folderPath: string;
  name: string;
  driveId: string;
  url: string;
  folderUrl?: string | null;
  mime: string;
  size: number;
  by: string;
}) {
  const [row] = await q<{ id: number }>(
    `INSERT INTO drive_files (org_id, resource, record_id, folder_path, name, drive_id, url, folder_url, mime, size, uploaded_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
    [f.orgId, f.resource, f.recordId, f.folderPath, f.name, f.driveId, f.url, f.folderUrl ?? null, f.mime, f.size, f.by],
  );
  return row.id;
}

type R = Record<string, unknown>;

/** Where a record's files live: Brand / Campaign / kind. Everything stays inside the configured root folder. */
export function folderFor(resource: string, row: R | null): { path: string; label: string; fileName: (original: string) => string } {
  const brand = safeName(row?.brand, "Umum");
  const ext = (n: string) => (n.includes(".") ? n.slice(n.lastIndexOf(".")).toLowerCase().slice(0, 8) : "");
  const stamp = (v: unknown) => String(v ?? "").slice(0, 10);
  switch (resource) {
    case "content":
      return {
        path: `${brand}/${safeName(row?.campaign, "Tanpa Campaign")}/Konten`,
        label: "Desain & materi konten",
        fileName: (o) => safeName([stamp(row?.post_date), row?.channel, row?.title].filter(Boolean).join(" - "), "konten") + ext(o),
      };
    case "ads":
      return { path: `${brand}/${safeName(row?.campaign_name)}/Creative Iklan`, label: "Creative iklan", fileName: (o) => safeName(o.replace(/\.[^.]+$/, ""), "creative") + ext(o) };
    case "influencers":
      return { path: `${brand}/Influencer/${safeName(row?.influencer)}`, label: "Kontrak & materi influencer", fileName: (o) => safeName(o.replace(/\.[^.]+$/, ""), "file") + ext(o) };
    case "contacts":
      return { path: `${brand}/Blast/${safeName(row?.batch, "Kontak")}`, label: "File blast", fileName: (o) => safeName(o.replace(/\.[^.]+$/, ""), "file") + ext(o) };
    case "events":
      return { path: `${brand}/Event/${safeName(row?.title)}`, label: "Materi event", fileName: (o) => safeName(o.replace(/\.[^.]+$/, ""), "file") + ext(o) };
    default:
      return { path: `Lainnya/${safeName(resource)}`, label: "File", fileName: (o) => safeName(o.replace(/\.[^.]+$/, ""), "file") + ext(o) };
  }
}
