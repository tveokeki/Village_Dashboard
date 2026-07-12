import { NextRequest, NextResponse } from "next/server";

const protectedPagePrefixes = [
  "/dashboard",
  "/announcements",
  "/tickets",
  "/documents",
  "/notifications",
  "/profile",
  "/registration",
  "/admin",
  "/finance",
  "/revenue",
  "/common-fee-report",
  "/common-fee-history",
  "/expenses",
  "/reconciliation",
  "/financial-reports",
];

const sessionCookieNames = [
  "next-auth.session-token",
  "__Secure-next-auth.session-token",
  "authjs.session-token",
  "__Secure-authjs.session-token",
];

function hasSessionCookie(req: NextRequest) {
  return sessionCookieNames.some((name) => Boolean(req.cookies.get(name)?.value));
}

function isProtectedPage(pathname: string) {
  return protectedPagePrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function publicLoginUrl(req: NextRequest) {
  const host = req.headers.get("host") || "";
  const proto = req.headers.get("x-forwarded-proto") || req.nextUrl.protocol.replace(":", "") || "https";
  const url = new URL("/login", `${proto}://${host || req.nextUrl.host}`);
  url.searchParams.set("callbackUrl", `${req.nextUrl.pathname}${req.nextUrl.search}`);
  return url;
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (!isProtectedPage(pathname)) {
    return NextResponse.next();
  }

  if (!hasSessionCookie(req)) {
    return NextResponse.redirect(publicLoginUrl(req));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/announcements/:path*",
    "/tickets/:path*",
    "/documents/:path*",
    "/notifications/:path*",
    "/profile/:path*",
    "/registration/:path*",
    "/admin/:path*",
    "/finance/:path*",
    "/revenue/:path*",
    "/common-fee-report/:path*",
    "/common-fee-history/:path*",
    "/expenses/:path*",
    "/reconciliation/:path*",
    "/financial-reports/:path*",
  ],
};
