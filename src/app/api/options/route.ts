import { NextResponse } from "next/server";
import { handle, HttpError, requireSession } from "@/lib/auth";
import { DEFAULT_OPTIONS } from "@/lib/resources";
import { logActivity, q } from "@/lib/db";

export const PUT = handle(async (req: Request) => {
  const s = await requireSession(["owner", "admin"]);
  const { key, values } = (await req.json()) as { key: string; values: string[] };
  if (!DEFAULT_OPTIONS[key]) throw new HttpError(400, "Daftar pilihan tidak dikenal");
  const clean = [...new Set((values ?? []).map((v) => String(v).trim()).filter(Boolean))];
  await q(
    `INSERT INTO option_sets (org_id, key, vals) VALUES ($1,$2,$3::jsonb) ON CONFLICT (org_id, key) DO UPDATE SET vals = EXCLUDED.vals`,
    [s.org, key, JSON.stringify(clean)],
  );
  await logActivity(s.org, s.name, "Ubah pilihan", DEFAULT_OPTIONS[key].label);
  return NextResponse.json({ ok: true, values: clean });
});

export const DELETE = handle(async (req: Request) => {
  const s = await requireSession(["owner", "admin"]);
  const key = new URL(req.url).searchParams.get("key");
  await q(`DELETE FROM option_sets WHERE org_id=$1 AND key=$2`, [s.org, key]);
  return NextResponse.json({ ok: true, values: DEFAULT_OPTIONS[key ?? ""]?.values ?? [] });
});
