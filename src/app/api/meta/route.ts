import { NextResponse } from "next/server";
import { handle, requireSession } from "@/lib/auth";
import { getBrands, getOptions } from "@/lib/repo";
import { q } from "@/lib/db";

export const GET = handle(async () => {
  const s = await requireSession();
  const [brands, options, users] = await Promise.all([
    getBrands(s.org),
    getOptions(s.org),
    q<{ id: number; name: string }>(`SELECT id, name FROM users WHERE org_id = $1 ORDER BY name`, [s.org]),
  ]);
  return NextResponse.json({ session: s, brands, options, users });
});
