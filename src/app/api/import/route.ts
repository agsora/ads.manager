import { NextResponse } from "next/server";
import { handle, HttpError, requireSession } from "@/lib/auth";
import { getResource, RESOURCE_MAP, type Resource } from "@/lib/resources";
import { guessResource, parseSheet, parseWalletSummary, readWorkbook, type ParsedSheet } from "@/lib/excel";
import { deleteMatching, getBrands, insertMany } from "@/lib/repo";
import { logActivity, q } from "@/lib/db";
import { activityEvent } from "@/lib/events";
import { driveEnabled, saveFileRecord, uploadFromServer } from "@/lib/drive";
import { after } from "next/server";

export const maxDuration = 60;

export const POST = handle(async (req: Request) => {
  const s = await requireSession();
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "File belum dipilih");
  if (file.size > 15 * 1024 * 1024) throw new HttpError(400, "Ukuran file maksimal 15MB");
  const target = String(form.get("resource") || "auto");
  const defaultBrand = String(form.get("brand") || "") || null;
  const defaultPlatform = String(form.get("platform") || "") || null;
  const preview = form.get("preview") === "1";
  const replace = form.get("replace") === "1";

  const sheets = await readWorkbook(await file.arrayBuffer(), file.name);
  const brands = (await getBrands(s.org)).map((b) => b.name);
  const brandFromSheet = (name: string) => brands.find((b) => name.toLowerCase().includes(b.toLowerCase())) ?? null;

  const parsed: ParsedSheet[] = [];
  const ignored: string[] = [];
  for (const sh of sheets) {
    let r: Resource | undefined = target === "auto" ? guessResource(sh.name) : getResource(target);
    if (target === "auto" && !r && /ringkasan|saldo/i.test(sh.name)) r = RESOURCE_MAP.wallets;
    if (!r) {
      ignored.push(sh.name);
      continue;
    }
    const brand = brandFromSheet(sh.name) ?? defaultBrand;
    if (r.key === "wallets" && /ringkasan/i.test(sh.name)) {
      const rows = parseWalletSummary(sh);
      if (rows.length) parsed.push({ sheet: sh.name, resource: r, rows: rows.map((x) => Object.fromEntries(r!.fields.map((f) => [f.key, x[f.key] ?? null]))), skipped: 0, matched: Object.keys(rows[0]) });
      else ignored.push(sh.name);
      continue;
    }
    const p = parseSheet(sh, r, brand, defaultPlatform);
    if (p && (p.rows.length || target !== "auto")) parsed.push(p);
    else ignored.push(sh.name);
    if (target !== "auto") break; // single-module import uses the first matching sheet
  }
  if (!parsed.length) throw new HttpError(400, "Tidak ada sheet/kolom yang cocok. Gunakan template dari tombol 'Template' atau pastikan judul kolom sesuai.");

  // required fields that a file may not carry (brand, platform) must come from the dialog defaults
  for (const p of parsed) {
    for (const key of ["brand", "platform"]) {
      const f = p.resource.fields.find((x) => x.key === key && x.required);
      if (f && p.rows.some((r) => !r[key]))
        throw new HttpError(400, `File "${p.sheet}" tidak punya kolom ${f.label}. Pilih ${f.label} default di form impor lalu coba lagi.`);
    }
  }

  const summary = parsed.map((p) => ({
    sheet: p.sheet,
    resource: p.resource.key,
    label: p.resource.label,
    rows: p.rows.length,
    skipped: p.skipped,
    matched: p.matched.map((k) => p.resource.fields.find((f) => f.key === k)?.label ?? k),
    upsert: !!p.resource.upsertKeys,
    sample: p.rows.slice(0, 5),
  }));
  if (preview) return NextResponse.json({ preview: true, summary, ignored });

  let total = 0;
  let replaced = 0;
  for (const p of parsed) {
    if (replace) await q(`DELETE FROM ${p.resource.table} WHERE org_id=$1`, [s.org]);
    else {
      const old = await deleteMatching(s.org, p.resource, p.rows);
      replaced += old.length;
      // fields the file doesn't carry (manual status, revenue, notes…) survive the re-import
      const keep = (p.resource.preserveOnReimport ?? []).filter((k) => !p.matched.includes(k));
      if (old.length && keep.length) {
        const keyOf = (x: Record<string, unknown>) => (p.resource.upsertKeys ?? []).map((k) => String(x[k] ?? "")).join("|");
        const byKey = new Map(old.map((o) => [keyOf(o), o]));
        for (const row of p.rows) {
          const prev = byKey.get(keyOf(row));
          if (prev) for (const k of keep) if (prev[k] !== null && prev[k] !== undefined) row[k] = prev[k];
        }
      }
    }
    for (const b of new Set(p.rows.map((r) => r.brand).filter(Boolean) as string[]))
      await q(`INSERT INTO brands (org_id, name) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [s.org, b]);
    total += await insertMany(s.org, p.resource, p.rows);
  }
  await logActivity(s.org, s.name, "Impor data", `${file.name}: ${total} baris${replaced ? ` (${replaced} diperbarui)` : ""}`);
  const labels = [...new Set(parsed.map((p) => p.resource.label))].join(", ");
  const firstKey = parsed[0].resource.key;
  const LINK: Record<string, string> = { ads: "/ads", content: "/content", leads: "/leads", contacts: "/blast", blast: "/blast", reviews: "/reviews" };
  // keep the original upload in Drive: Arsip Impor / <module> / <yyyy-mm>
  if ((await driveEnabled()) && file.size <= 20 * 1024 * 1024) {
    const bytes = Buffer.from(await file.arrayBuffer());
    const folder = `Arsip Impor/${parsed[0].resource.label}/${new Date().toISOString().slice(0, 7)}`;
    after(async () => {
      try {
        const up = await uploadFromServer(folder, `${new Date().toISOString().slice(0, 10)} ${file.name}`, file.type || "application/octet-stream", bytes);
        await saveFileRecord({ orgId: s.org, resource: "import", recordId: null, folderPath: folder, name: file.name, driveId: up.id, url: up.url, folderUrl: up.folderUrl, mime: file.type, size: file.size, by: s.name });
      } catch (e) {
        console.error("drive archive failed", e);
      }
    });
  }
  activityEvent(
    s,
    `${s.name} mengimpor ${total} baris ${labels}`,
    `File ${file.name}${replaced ? ` · ${replaced} baris lama diperbarui` : ""}.`,
    LINK[firstKey] ?? "/data",
    parsed.some((p) => p.resource.key === "content") ? "content" : "activity",
    req,
  );
  return NextResponse.json({ ok: true, imported: total, replaced, summary: summary.map((x) => ({ ...x, sample: undefined })), ignored });
});
