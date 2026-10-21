import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";
import { getSetting, q, setSetting } from "./db";

/**
 * Google Drive through the official API, authorised with the owner's OAuth refresh token
 * (files are owned by the connected Google account and use its storage quota).
 *
 *  - Large browser uploads: the server opens a resumable session; the browser sends the file in
 *    ~3.5 MB chunks to /api/drive/chunk, which forwards them to Drive (stays under the serverless body limit).
 *  - Server-side uploads (weekly report, import archive) use a single multipart request.
 */

export const MAX_UPLOAD = 25 * 1024 * 1024;
export const CHUNK = 14 * 256 * 1024; // 3,670,016 bytes: a multiple of 256 KiB as Drive requires

const API = (process.env.DRIVE_API_BASE || "https://www.googleapis.com").replace(/\/$/, "");
const TOKEN_URL = process.env.GOOGLE_TOKEN_URL || "https://oauth2.googleapis.com/token";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const SCOPE = "https://www.googleapis.com/auth/drive";

const secretKey = () => createHash("sha256").update(process.env.AUTH_SECRET || "dev-insecure-secret-change-me").digest();

function encrypt(text: string) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", secretKey(), iv);
  const enc = Buffer.concat([c.update(text, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString("base64url")).join(".");
}
function decrypt(blob: string) {
  const [iv, tag, enc] = blob.split(".").map((p) => Buffer.from(p, "base64url"));
  const d = createDecipheriv("aes-256-gcm", secretKey(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
}

export const clientCreds = () => {
  const id = process.env.GOOGLE_CLIENT_ID;
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  return id && secret ? { id, secret } : null;
};
export const rootFolderId = () => process.env.DRIVE_FOLDER_ID || null;
export const rootFolderUrl = () => (rootFolderId() ? `https://drive.google.com/drive/folders/${rootFolderId()}` : null);

async function refreshToken(): Promise<string | null> {
  if (process.env.GOOGLE_REFRESH_TOKEN) return process.env.GOOGLE_REFRESH_TOKEN;
  const blob = await getSetting("drive_refresh_token");
  if (!blob) return null;
  try {
    return decrypt(blob);
  } catch {
    return null;
  }
}

export async function driveStatus() {
  const creds = !!clientCreds();
  const token = creds ? !!(await refreshToken()) : false;
  return {
    hasClient: creds,
    connected: creds && token && !!rootFolderId(),
    needsFolder: !rootFolderId(),
    account: await getSetting("drive_account"),
  };
}
export const driveEnabled = async () => (await driveStatus()).connected;

// ---------------------------------------------------------------- OAuth
export function authUrl(redirectUri: string, state: string) {
  const c = clientCreds();
  if (!c) throw new Error("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET belum di-set");
  const p = new URLSearchParams({ client_id: c.id, redirect_uri: redirectUri, response_type: "code", scope: SCOPE, access_type: "offline", prompt: "consent", include_granted_scopes: "true", state });
  return `${AUTH_URL}?${p}`;
}

export function signState(payload: Record<string, unknown>) {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + 10 * 60_000 })).toString("base64url");
  return `${body}.${createHmac("sha256", secretKey()).update(body).digest("base64url")}`;
}
export function verifyState<T>(token: string): (T & { exp: number }) | null {
  const [body, sig] = token.split(".");
  if (!body || !sig || createHmac("sha256", secretKey()).update(body).digest("base64url") !== sig) return null;
  const j = JSON.parse(Buffer.from(body, "base64url").toString()) as T & { exp: number };
  return j.exp > Date.now() ? j : null;
}

export async function exchangeCode(code: string, redirectUri: string) {
  const c = clientCreds()!;
  const r = await fetch(TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code, client_id: c.id, client_secret: c.secret, redirect_uri: redirectUri, grant_type: "authorization_code" }) });
  const j = (await r.json()) as { refresh_token?: string; error_description?: string; error?: string };
  if (!r.ok || !j.refresh_token) throw new Error(j.error_description ?? j.error ?? "Google tidak mengembalikan refresh token (coba hubungkan ulang)");
  await setSetting("drive_refresh_token", encrypt(j.refresh_token));
  cached = null;
  return j.refresh_token;
}

export async function disconnect() {
  await q(`DELETE FROM app_meta WHERE key IN ('drive_refresh_token','drive_account')`);
  await q(`DELETE FROM drive_folders`);
  cached = null;
}

let cached: { token: string; exp: number } | null = null;
async function accessToken() {
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;
  const c = clientCreds();
  const rt = await refreshToken();
  if (!c || !rt) throw new Error("Google Drive belum terhubung");
  const r = await fetch(TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: c.id, client_secret: c.secret, refresh_token: rt, grant_type: "refresh_token" }) });
  const j = (await r.json()) as { access_token?: string; expires_in?: number; error?: string; error_description?: string };
  if (!r.ok || !j.access_token) {
    if (j.error === "invalid_grant") throw new Error("Akses Google Drive kedaluwarsa atau dicabut. Hubungkan ulang di menu File & Drive.");
    throw new Error(j.error_description ?? j.error ?? "Gagal mengambil token Google");
  }
  cached = { token: j.access_token, exp: Date.now() + (j.expires_in ?? 3600) * 1000 };
  return cached.token;
}

async function g<T = Record<string, unknown>>(path: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(path.startsWith("http") ? path : `${API}${path}`, { ...init, headers: { Authorization: `Bearer ${await accessToken()}`, ...(init.headers ?? {}) }, signal: AbortSignal.timeout(55_000) });
  const text = await r.text();
  if (!r.ok) {
    let msg = text;
    try {
      msg = (JSON.parse(text) as { error?: { message?: string } }).error?.message ?? text;
    } catch {
      /* keep raw */
    }
    const e = new Error(`Google Drive: ${msg}`) as Error & { status: number };
    e.status = r.status;
    throw e;
  }
  return (text ? JSON.parse(text) : {}) as T;
}

export async function recordAccount() {
  try {
    const a = await g<{ user?: { emailAddress?: string } }>("/drive/v3/about?fields=user(emailAddress)");
    if (a.user?.emailAddress) await setSetting("drive_account", a.user.emailAddress);
  } catch {
    /* non-critical */
  }
}

// ---------------------------------------------------------------- folders
export const safeName = (v: unknown, fallback = "Tanpa nama") =>
  String(v ?? "")
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80) || fallback;

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

/** Finds or creates Brand/Campaign/… under the root folder; ids are cached in the database. */
export async function ensureFolder(path: string, fresh = false): Promise<string> {
  const root = rootFolderId();
  if (!root) throw new Error("DRIVE_FOLDER_ID belum di-set");
  let parent: string = root;
  for (const name of path.split("/").filter(Boolean)) {
    if (!fresh) {
      const [hit] = await q<{ drive_id: string }>(`SELECT drive_id FROM drive_folders WHERE parent_id = $1 AND name = $2`, [parent, name]);
      if (hit) {
        parent = hit.drive_id;
        continue;
      }
    }
    const list = await g<{ files?: { id: string }[] }>(`/drive/v3/files?q=${encodeURIComponent(`'${esc(parent)}' in parents and name = '${esc(name)}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`)}&fields=files(id)&pageSize=1&supportsAllDrives=true&includeItemsFromAllDrives=true`);
    let id = list.files?.[0]?.id;
    if (!id) id = (await g<{ id: string }>("/drive/v3/files?fields=id&supportsAllDrives=true", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", parents: [parent] }) })).id;
    await q(`INSERT INTO drive_folders (parent_id, name, drive_id) VALUES ($1,$2,$3) ON CONFLICT (parent_id, name) DO UPDATE SET drive_id = EXCLUDED.drive_id`, [parent, name, id]);
    parent = id;
  }
  return parent;
}

/** Runs fn with the folder id; if Drive says the cached folder is gone, rebuilds the cache once. */
async function withFolder<T>(path: string, fn: (folderId: string) => Promise<T>): Promise<T> {
  try {
    return await fn(await ensureFolder(path));
  } catch (e) {
    if ((e as { status?: number }).status === 404) {
      await q(`DELETE FROM drive_folders`);
      return fn(await ensureFolder(path, true));
    }
    throw e;
  }
}

const folderUrlOf = (id: string) => `https://drive.google.com/drive/folders/${id}`;

async function shareByLink(id: string) {
  if ((await getSetting("drive_share_link")) === "false") return;
  try {
    await g(`/drive/v3/files/${id}/permissions?supportsAllDrives=true`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role: "reader", type: "anyone" }) });
  } catch {
    /* sharing may be restricted by the account: previews then work only for people with access */
  }
}

export interface Uploaded {
  id: string;
  url: string;
  size: number;
  folderUrl: string;
}

type DriveFile = { id: string; webViewLink?: string; size?: string };

// ---------------------------------------------------------------- browser uploads (resumable, chunked through the server)
export async function startResumable(path: string, name: string, mime: string, size: number, uid: number) {
  const { session, folderId } = await withFolder(path, async (folderId) => {
    const r = await fetch(`${API}/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true&fields=id,webViewLink,size`, {
      method: "POST",
      headers: { Authorization: `Bearer ${await accessToken()}`, "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Type": mime || "application/octet-stream", "X-Upload-Content-Length": String(size) },
      body: JSON.stringify({ name, parents: [folderId] }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!r.ok) {
      const e = new Error(`Google Drive: ${(await r.text()).slice(0, 300)}`) as Error & { status: number };
      e.status = r.status;
      throw e;
    }
    const session = r.headers.get("location");
    if (!session) throw new Error("Google Drive tidak memberi sesi upload");
    return { session, folderId };
  });
  return signState({ s: session, f: folderId, u: uid, t: size });
}

/** Forwards one chunk. Returns the finished file when the last chunk lands. */
export async function sendChunk(ticket: string, uid: number, start: number, data: Buffer): Promise<{ done: false } | ({ done: true } & Uploaded)> {
  const t = verifyState<{ s: string; f: string; u: number; t: number }>(ticket);
  if (!t || t.u !== uid) throw new Error("Izin upload tidak valid atau kedaluwarsa, ulangi");
  if (!t.s.startsWith(`${API}/upload/drive/v3/files`)) throw new Error("Sesi upload tidak valid");
  const end = start + data.length - 1;
  const r = await fetch(t.s, {
    method: "PUT",
    headers: { "Content-Length": String(data.length), "Content-Range": `bytes ${start}-${end}/${t.t}` },
    body: new Uint8Array(data),
    signal: AbortSignal.timeout(55_000),
  });
  if (r.status === 308) return { done: false };
  if (!r.ok) throw new Error(`Google Drive: ${(await r.text()).slice(0, 300)}`);
  const f = (await r.json()) as DriveFile;
  await shareByLink(f.id);
  return { done: true, id: f.id, url: f.webViewLink ?? `https://drive.google.com/file/d/${f.id}/view`, size: Number(f.size ?? t.t), folderUrl: folderUrlOf(t.f) };
}

// ---------------------------------------------------------------- server uploads
export async function uploadFromServer(path: string, name: string, mime: string, data: Buffer): Promise<Uploaded> {
  if (!(await driveEnabled())) throw new Error("Google Drive belum terhubung");
  if (data.length > MAX_UPLOAD) throw new Error("File melebihi 25 MB");
  return withFolder(path, async (folderId) => {
    const boundary = `b${randomBytes(8).toString("hex")}`;
    const head = Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name, parents: [folderId] })}\r\n--${boundary}\r\nContent-Type: ${mime || "application/octet-stream"}\r\n\r\n`);
    const body = Buffer.concat([head, data, Buffer.from(`\r\n--${boundary}--`)]);
    const f = await g<DriveFile>("/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,webViewLink,size", { method: "POST", headers: { "Content-Type": `multipart/related; boundary=${boundary}` }, body: new Uint8Array(body) });
    await shareByLink(f.id);
    return { id: f.id, url: f.webViewLink ?? `https://drive.google.com/file/d/${f.id}/view`, size: Number(f.size ?? data.length), folderUrl: folderUrlOf(folderId) };
  });
}

export async function trashInDrive(id: string) {
  if (!(await driveEnabled())) return;
  await g(`/drive/v3/files/${encodeURIComponent(id)}?supportsAllDrives=true`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trashed: true }) });
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
  const plain = (o: string, fb: string) => safeName(o.replace(/\.[^.]+$/, ""), fb) + ext(o);
  switch (resource) {
    case "content":
      return {
        path: `${brand}/${safeName(row?.campaign, "Tanpa Campaign")}/Konten`,
        label: "Desain & materi konten",
        fileName: (o) => safeName([stamp(row?.post_date), row?.channel, row?.title].filter(Boolean).join(" - "), "konten") + ext(o),
      };
    case "ads":
      return { path: `${brand}/${safeName(row?.campaign_name)}/Creative Iklan`, label: "Creative iklan", fileName: (o) => plain(o, "creative") };
    case "influencers":
      return { path: `${brand}/Influencer/${safeName(row?.influencer)}`, label: "Kontrak & materi influencer", fileName: (o) => plain(o, "file") };
    case "contacts":
      return { path: `${brand}/Blast/${safeName(row?.batch, "Kontak")}`, label: "File blast", fileName: (o) => plain(o, "file") };
    case "events":
      return { path: `${brand}/Event/${safeName(row?.title)}`, label: "Materi event", fileName: (o) => plain(o, "file") };
    default:
      return { path: `Lainnya/${safeName(resource)}`, label: "File", fileName: (o) => plain(o, "file") };
  }
}
