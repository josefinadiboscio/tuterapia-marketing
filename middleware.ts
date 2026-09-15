import { NextResponse, type NextRequest } from "next/server";
import { COOKIE, tokenDeSesion } from "@/lib/sesion";

/**
 * Everything is behind the gate except the login screen and the cron routes,
 * which carry their own bearer token.
 *
 * Fails closed: with no DASHBOARD_PASSWORD set, nobody gets in. An open
 * dashboard is worse than a locked one.
 */
export async function middleware(request: NextRequest) {
  const password = process.env.DASHBOARD_PASSWORD;
  if (!password) {
    return NextResponse.redirect(new URL("/login?falta=1", request.url));
  }

  const cookie = request.cookies.get(COOKIE)?.value;
  if (cookie && cookie === (await tokenDeSesion(password))) {
    return NextResponse.next();
  }

  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  matcher: ["/((?!login|api/login|api/cron|_next/static|_next/image|favicon).*)"],
};
