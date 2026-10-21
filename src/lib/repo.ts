import { q } from "./db";
import { coerce } from "./coerce";
import { DEFAULT_OPTIONS, type Resource, type Row } from "./resources";

export interface ListFilter {
  from?: string | null;
  to?: string | null;
  brand?: string | null;
  search?: string | null;
  limit?: number;
}

export async function listRows(orgId: number, r: Resource, f: ListFilter = {}): Promise<Row[]> {
  const where = ["org_id = $1"];
  const params: unknown[] = [orgId];
  const add = (cond: string, v: unknown) => {
    params.push(v);
    where.push(cond.replace("?", `$${params.length}`));
  };
  const ranged = r.fields.some((x) => x.key === "end_date");
  // ranged rows (campaigns, events) match when their [start, end] overlaps the window
  if (f.from) add(ranged ? `COALESCE(end_date, ${r.dateField}) >= ?` : `${r.dateField} >= ?`, f.from);
  if (f.to) add(`${r.dateField} <= ?`, f.to);
  if (f.brand && r.fields.some((x) => x.key === "brand")) add(`brand = ?`, f.brand);
  if (f.search) {
    const textCols = r.fields.filter((x) => !["date", "number", "money", "percent", "rating"].includes(x.type)).map((x) => x.key);
    params.push(`%${f.search}%`);
    where.push(`(${textCols.map((c) => `${c} ILIKE $${params.length}`).join(" OR ")})`);
  }
  const limit = Math.min(f.limit ?? 5000, 20000);
  const sort = r.defaultSort ?? r.dateField;
  return q<Row>(
    `SELECT * FROM ${r.table} WHERE ${where.join(" AND ")} ORDER BY ${sort} DESC NULLS LAST, id DESC LIMIT ${limit}`,
    params,
  );
}

export function cleanInput(r: Resource, body: Record<string, unknown>, fromImport = false) {
  const out: Record<string, unknown> = {};
  for (const f of r.fields) {
    if (!(f.key in body)) continue;
    out[f.key] = coerce(f, body[f.key], fromImport);
  }
  return out;
}

export function validate(r: Resource, data: Record<string, unknown>): string | null {
  for (const f of r.fields) {
    if (f.required && (data[f.key] === null || data[f.key] === undefined || data[f.key] === "")) return `${f.label} wajib diisi`;
  }
  return null;
}

export async function insertRow(orgId: number, r: Resource, data: Record<string, unknown>) {
  const keys = Object.keys(data);
  const cols = ["org_id", ...keys];
  const vals = [orgId, ...keys.map((k) => data[k])];
  const rows = await q<Row>(
    `INSERT INTO ${r.table} (${cols.join(",")}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(",")}) RETURNING *`,
    vals,
  );
  return rows[0];
}

export async function insertMany(orgId: number, r: Resource, rows: Record<string, unknown>[]) {
  if (!rows.length) return 0;
  const keys = r.fields.map((f) => f.key);
  const cols = ["org_id", ...keys];
  let count = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const params: unknown[] = [];
    const tuples = chunk.map((row) => {
      const vals = [orgId, ...keys.map((k) => row[k] ?? null)];
      const ph = vals.map((v) => {
        params.push(v);
        return `$${params.length}`;
      });
      return `(${ph.join(",")})`;
    });
    await q(`INSERT INTO ${r.table} (${cols.join(",")}) VALUES ${tuples.join(",")}`, params);
    count += chunk.length;
  }
  return count;
}

export async function updateRow(orgId: number, r: Resource, id: number, data: Record<string, unknown>) {
  const keys = Object.keys(data);
  if (!keys.length) throw new Error("Tidak ada data yang diubah");
  const sets = keys.map((k, i) => `${k} = $${i + 3}`);
  const rows = await q<Row>(
    `UPDATE ${r.table} SET ${sets.join(", ")}, updated_at = now() WHERE org_id = $1 AND id = $2 RETURNING *`,
    [orgId, id, ...keys.map((k) => data[k])],
  );
  return rows[0];
}

export async function deleteRows(orgId: number, r: Resource, ids: number[]) {
  if (!ids.length) return 0;
  const rows = await q(`DELETE FROM ${r.table} WHERE org_id = $1 AND id = ANY($2::int[]) RETURNING id`, [orgId, ids]);
  return rows.length;
}

export async function getOptions(orgId: number) {
  const rows = await q<{ key: string; vals: string[] }>(`SELECT key, vals FROM option_sets WHERE org_id = $1`, [orgId]);
  const out: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(DEFAULT_OPTIONS)) out[k] = v.values;
  for (const r of rows) out[r.key] = r.vals;
  return out;
}

export async function getBrands(orgId: number) {
  return q<{ id: number; name: string; industry: string | null; color: string | null; notes: string | null }>(
    `SELECT id, name, industry, color, notes FROM brands WHERE org_id = $1 ORDER BY name`,
    [orgId],
  );
}
