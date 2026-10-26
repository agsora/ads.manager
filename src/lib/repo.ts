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

/** Fill derived values for a complete new row (create / import), never for partial updates. */
export function applyDerive(r: Resource, data: Record<string, unknown>) {
  return r.derive ? r.derive({ ...data }) : data;
}

/** Delete rows that an import is about to replace (same values for the resource's upsertKeys); returns the old rows. */
export async function deleteMatching(orgId: number, r: Resource, rows: Record<string, unknown>[]): Promise<Row[]> {
  if (!r.upsertKeys?.length || !rows.length) return [];
  const keys = r.upsertKeys;
  const tuples = rows.filter((x) => keys.some((k) => x[k] !== null && x[k] !== undefined && x[k] !== ""));
  const deleted: Row[] = [];
  for (let i = 0; i < tuples.length; i += 500) {
    const chunk = tuples.slice(i, i + 500);
    const cols = keys.map((k) => chunk.map((x) => (x[k] === null || x[k] === undefined ? "" : String(x[k]))));
    const res = await q<Row>(
      `DELETE FROM ${r.table} WHERE org_id = $1 AND (${keys.map((k) => `COALESCE(${k}::text, '')`).join(", ")}) IN (SELECT * FROM unnest(${keys.map((_, j) => `$${j + 2}::text[]`).join(", ")})) RETURNING *`,
      [orgId, ...cols],
    );
    deleted.push(...res);
  }
  return deleted;
}

/** Fields where a negative amount is legitimate (an overdrawn opening balance). */
const MAY_BE_NEGATIVE = new Set(["opening_balance"]);

export function validate(r: Resource, data: Record<string, unknown>): string | null {
  for (const f of r.fields) {
    const v = data[f.key];
    if (f.required && (v === null || v === undefined || v === "")) return `${f.label} wajib diisi`;
    if (typeof v === "number" && ["number", "money", "percent", "rating"].includes(f.type)) {
      if (Math.abs(v) > 1e13) return `${f.label} terlalu besar`;
      if (v < 0 && !MAY_BE_NEGATIVE.has(f.key)) return `${f.label} tidak boleh negatif`;
      if (f.type === "rating" && (v < 0 || v > 5)) return `${f.label} harus antara 0,0 dan 5,0`;
    }
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
