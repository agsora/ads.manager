import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifyToken } from "@/lib/token";

const PUBLIC = ["/login", "/register", "/api/auth", "/api/cron"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(p + "/"))) return NextResponse.next();
  const session = await verifyToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (session) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Silakan login terlebih dahulu" }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|svg|jpg|ico)$).*)"],
};
