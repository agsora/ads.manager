import { NextResponse } from "next/server";
import { handle, requireSession } from "@/lib/auth";
import { getBrands, getOptions } from "@/lib/repo";

export const GET = handle(async () => {
  const s = await requireSession();
  const [brands, options] = await Promise.all([getBrands(s.org), getOptions(s.org)]);
  return NextResponse.json({ session: s, brands, options });
});
