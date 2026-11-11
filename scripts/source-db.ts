import { config, parse } from "dotenv";
import { existsSync, readFileSync } from "node:fs";
import { spawn, type ChildProcess } from "node:child_process";
import net from "node:net";
import { Client } from "pg";

export function loadSourceEnv() {
  config({ path: ".env.local", quiet: true });
  const fallback = process.env.DASHBOARD_ENV || "C:/coding/dashboard/.env.local";
  if (existsSync(fallback)) {
    const values = parse(readFileSync(fallback));
    for (const key of ["DATABASE_URL_KONVENSIONAL", "DATABASE_URL_SYARIAH", "SSH_TUNNEL_KONVENSIONAL", "SSH_TUNNEL_SYARIAH"]) if (!process.env[key] && values[key]) process.env[key] = values[key];
  }
}
export type Source = "konvensional" | "syariah";
const tunnels: ChildProcess[] = [];
const open = (port: number) => new Promise<boolean>((resolve) => {
  const s = net.connect({ host: "127.0.0.1", port, timeout: 800 });
  s.once("connect", () => { s.destroy(); resolve(true); });
  s.once("timeout", () => { s.destroy(); resolve(false); });
  s.once("error", () => { s.destroy(); resolve(false); });
});
export async function sourceQuery<T extends Record<string, unknown>>(segment: Source, text: string, params: unknown[] = []): Promise<T[]> {
  const original = process.env[`DATABASE_URL_${segment.toUpperCase()}`];
  if (!original) throw new Error(`${segment}: konfigurasi koneksi belum tersedia`);
  const url = new URL(original);
  const alias = process.env[`SSH_TUNNEL_${segment.toUpperCase()}`];
  if (alias) {
    const port = segment === "konvensional" ? 15432 : 15433;
    if (!(await open(port))) {
      const child = spawn("ssh", ["-N", "-C", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes", "-o", "ExitOnForwardFailure=yes", "-o", "ConnectTimeout=15", "-o", "ServerAliveInterval=30", "-L", `127.0.0.1:${port}:${url.hostname}:${url.port || 5432}`, alias], { stdio: "ignore", windowsHide: true });
      let failed = false;
      child.on("error", () => { failed = true; });
      tunnels.push(child);
      const until = Date.now() + 25000;
      while (!(await open(port))) {
        if (failed || child.exitCode !== null || Date.now() > until) throw new Error(`${segment}: tunnel SSH tidak tersedia`);
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    }
    url.hostname = "127.0.0.1"; url.port = String(port);
  }
  const disableSsl = url.searchParams.get("sslmode") === "disable";
  url.searchParams.delete("sslmode");
  const client = new Client({ connectionString: url.toString(), ssl: disableSsl ? false : { rejectUnauthorized: false }, connectionTimeoutMillis: 15000, query_timeout: 60000 });
  client.on("error", () => {});
  try {
    await client.connect();
    await client.query("BEGIN READ ONLY");
    const result = await client.query(text, params);
    await client.query("ROLLBACK");
    return result.rows as T[];
  } catch (e) {
    // Never propagate credentials, source SQL, or customer identities into logs or the UI.
    const code = (e as { code?: string }).code;
    throw new Error(`${segment}: pembacaan gagal${code ? ` (${code})` : ""}`);
  } finally { await client.end().catch(() => {}); }
}
export function closeSourceTunnels() { for (const child of tunnels) child.kill(); }
