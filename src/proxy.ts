import { NextResponse, type NextRequest } from "next/server";

const LOCALES = ["en", "ar"];

// Next.js 16 "proxy" (formerly middleware): send bare paths to /en or /ar.
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (LOCALES.some((l) => pathname === `/${l}` || pathname.startsWith(`/${l}/`))) return NextResponse.next();
  const pref = req.cookies.get("rs_lang")?.value;
  const accept = req.headers.get("accept-language") ?? "";
  const locale = pref && LOCALES.includes(pref) ? pref : /^ar\b/i.test(accept) ? "ar" : "en";
  const url = req.nextUrl.clone();
  url.pathname = `/${locale}${pathname === "/" ? "" : pathname}`;
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/((?!api|files|_next|favicon.ico|robots.txt|sitemap.xml|brand).*)"] };
