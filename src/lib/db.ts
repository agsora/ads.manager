import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { RESOURCES, type FieldType } from "./resources";

const SCHEMA_VERSION = "17";

// Keep DATE/TIMESTAMP as raw strings (no timezone shifting) and NUMERIC/INT8 as numbers.
const RAW = (v: string) => v;
const NUM = (v: string) => (v === null ? null : Number(v));
const typeParsers: Record<number, (v: string) => unknown> = {
  1082: RAW, // date
  1114: RAW, // timestamp
  1184: RAW, // timestamptz
  1083: RAW, // time
  1700: NUM, // numeric
  20: NUM, // int8
  21: NUM, // int2
  23: NUM, // int4
  700: NUM, // float4
  701: NUM, // float8
  16: (v: string) => v === "t" || v === "true", // bool
  3802: (v: string) => JSON.parse(v), // jsonb
  114: (v: string) => JSON.parse(v), // json
};

const TYPES = { getTypeParser: ((oid: number) => typeParsers[oid] ?? RAW) as never };

let _sql: NeonQueryFunction<false, false> | null = null;
export function sql() {
  if (!_sql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL belum di-set");
    _sql = neon(url);
  }
  return _sql;
}

export async function q<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  await ensureSchema();
  // type parsers only take effect when passed per query (not in the neon() constructor)
  return (await sql().query(text, params, { types: TYPES })) as T[];
}

const colType = (t: FieldType) => {
  if (t === "date") return "date";
  if (["number", "money", "percent", "rating"].includes(t)) return "numeric";
  return "text";
};

export function schemaStatements(): string[] {
  const s: string[] = [
    `CREATE TABLE IF NOT EXISTS app_meta (key text PRIMARY KEY, value text)`,
    `CREATE TABLE IF NOT EXISTS login_failures (id serial PRIMARY KEY, email text NOT NULL, ip text, at timestamptz DEFAULT now())`,
    `CREATE INDEX IF NOT EXISTS login_failures_email_at ON login_failures (email, at DESC)`,
    `CREATE TABLE IF NOT EXISTS organizations (id serial PRIMARY KEY, name text NOT NULL, created_at timestamptz DEFAULT now())`,
    `CREATE TABLE IF NOT EXISTS users (
      id serial PRIMARY KEY,
      org_id int NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      email text NOT NULL UNIQUE,
      name text NOT NULL,
      password_hash text NOT NULL,
      role text NOT NULL DEFAULT 'staff',
      created_at timestamptz DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS brands (
      id serial PRIMARY KEY,
      org_id int NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      name text NOT NULL,
      industry text,
      color text,
      notes text,
      created_at timestamptz DEFAULT now(),
      UNIQUE (org_id, name)
    )`,
    `CREATE TABLE IF NOT EXISTS option_sets (
      org_id int NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      key text NOT NULL,
      vals jsonb NOT NULL,
      PRIMARY KEY (org_id, key)
    )`,
    `CREATE TABLE IF NOT EXISTS notifications (
      id serial PRIMARY KEY,
      org_id int NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      user_id int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      category text NOT NULL,
      title text NOT NULL,
      body text,
      link text,
      actor text,
      read_at timestamptz,
      created_at timestamptz DEFAULT now()
    )`,
    `CREATE INDEX IF NOT EXISTS notifications_user ON notifications (user_id, read_at, created_at DESC)`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_prefs jsonb NOT NULL DEFAULT '{}'::jsonb`,
    `CREATE TABLE IF NOT EXISTS drive_files (
      id serial PRIMARY KEY,
      org_id int NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      resource text NOT NULL,
      record_id int,
      folder_path text NOT NULL,
      name text NOT NULL,
      drive_id text NOT NULL,
      url text NOT NULL,
      folder_url text,
      mime text,
      size bigint,
      uploaded_by text,
      created_at timestamptz DEFAULT now()
    )`,
    `CREATE INDEX IF NOT EXISTS drive_files_path ON drive_files (org_id, folder_path, created_at DESC)`,
    `CREATE TABLE IF NOT EXISTS drive_folders (
      parent_id text NOT NULL,
      name text NOT NULL,
      drive_id text NOT NULL,
      PRIMARY KEY (parent_id, name)
    )`,
    `CREATE TABLE IF NOT EXISTS activity_log (
      id serial PRIMARY KEY,
      org_id int NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      user_name text,
      action text NOT NULL,
      detail text,
      created_at timestamptz DEFAULT now()
    )`,
  ];
  for (const r of RESOURCES) {
    s.push(`CREATE TABLE IF NOT EXISTS ${r.table} (
      id serial PRIMARY KEY,
      org_id int NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    )`);
    for (const f of r.fields) s.push(`ALTER TABLE ${r.table} ADD COLUMN IF NOT EXISTS ${f.key} ${colType(f.type)}`);
    s.push(`CREATE INDEX IF NOT EXISTS ${r.table}_org_date ON ${r.table} (org_id, ${r.dateField})`);
  }
  // who entered a content plan, so its 7-day performance reminders reach that person
  s.push(`ALTER TABLE content_plans ADD COLUMN IF NOT EXISTS created_by int`);
  return s;
}

let ensured: Promise<void> | null = null;
export function ensureSchema() {
  if (!ensured) {
    ensured = (async () => {
      const db = sql();
      try {
        const rows = (await db.query(`SELECT value FROM app_meta WHERE key='schema_version'`)) as { value: string }[];
        if (rows[0]?.value === SCHEMA_VERSION) return;
      } catch {
        /* first run: table missing */
      }
      for (const stmt of schemaStatements()) await db.query(stmt);
      await db.query(
        `INSERT INTO app_meta (key, value) VALUES ('schema_version', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [SCHEMA_VERSION],
      );
    })().catch((e) => {
      ensured = null;
      throw e;
    });
  }
  return ensured;
}

export async function logActivity(orgId: number, user: string, action: string, detail?: string) {
  try {
    await q(`INSERT INTO activity_log (org_id, user_name, action, detail) VALUES ($1,$2,$3,$4)`, [orgId, user, action, detail ?? null]);
  } catch {
    /* non-critical */
  }
}

export async function getSetting(key: string) {
  const rows = await q<{ value: string }>(`SELECT value FROM app_meta WHERE key = $1`, [key]);
  return rows[0]?.value ?? null;
}

export async function setSetting(key: string, value: string) {
  await q(`INSERT INTO app_meta (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, [key, value]);
}
