/** Apps Script that runs as the Drive owner. Shown (with a copy button) on the File & Drive page. */
export const DRIVE_SCRIPT = (rootId: string) => `// Ads Manager — jembatan upload ke Google Drive (jalan atas nama akun Anda)
const SECRET = 'GANTI_DENGAN_RAHASIA_PANJANG';   // isi sama persis dengan DRIVE_SCRIPT_SECRET di Vercel
const ROOT_ID = '${rootId}';  // folder utama di Drive
const SHARE_WITH_LINK = true;  // true = file bisa dilihat siapa pun yang punya link, supaya preview di kalender tampil untuk seluruh tim

function doGet() { return out({ ok: true, service: 'ads-manager-drive' }); }

function doPost(e) {
  try {
    const b = JSON.parse(e.postData.contents);
    if (b.secret) {                                   // dari server (laporan, arsip)
      if (b.secret !== SECRET) return out({ error: 'unauthorized' });
      if (b.action === 'trash') {
        const f = DriveApp.getFileById(b.id);
        if (!inside(f)) return out({ error: 'di luar folder utama' });
        f.setTrashed(true);
        return out({ ok: true });
      }
      return save(b.path, b.name, b.mime, b.data);
    }
    const sig = hex(Utilities.computeHmacSha256Signature(b.grant, SECRET));   // dari browser
    if (sig !== b.sig) return out({ error: 'unauthorized' });
    const g = JSON.parse(b.grant);
    if (g.exp < Date.now()) return out({ error: 'izin upload kedaluwarsa, ulangi' });
    return save(g.path, g.name, b.mime, b.data);
  } catch (err) {
    return out({ error: String(err) });
  }
}

function save(path, name, mime, data) {
  const folder = ensurePath(path);
  const blob = Utilities.newBlob(Utilities.base64Decode(data), mime || 'application/octet-stream', name);
  const f = folder.createFile(blob);
  if (SHARE_WITH_LINK) { try { f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) {} }
  return out({ ok: true, id: f.getId(), url: f.getUrl(), size: f.getSize(), folderUrl: folder.getUrl() });
}

function ensurePath(path) {
  let cur = DriveApp.getFolderById(ROOT_ID);
  String(path).split('/').filter(Boolean).forEach(function (n) {
    const it = cur.getFoldersByName(n);
    cur = it.hasNext() ? it.next() : cur.createFolder(n);
  });
  return cur;
}

function inside(file) {
  let cur = file, depth = 0;
  while (depth++ < 12) {
    const ps = cur.getParents();
    if (!ps.hasNext()) return false;
    cur = ps.next();
    if (cur.getId() === ROOT_ID) return true;
  }
  return false;
}

function hex(bytes) { return bytes.map(function (x) { return ('0' + (x & 0xff).toString(16)).slice(-2); }).join(''); }
function out(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
`;
