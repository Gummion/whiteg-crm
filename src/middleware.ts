import { NextResponse, type NextRequest } from "next/server";

/**
 * Lightweight route guard: redirects to /login when no Supabase session cookie is present.
 * Real authorization is enforced by Supabase Row Level Security on every query,
 * so the server never needs to call Supabase here (fast, and works behind any network).
 */
export function middleware(request: NextRequest) {
  const hasSession = request.cookies.getAll().some((c) => /^sb-.+-auth-token(\.\d+)?$/.test(c.name) && c.value);
  const path = request.nextUrl.pathname;
  const isPublic = path.startsWith("/login") || path.startsWith("/auth");

  if (!hasSession && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  if (hasSession && path === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api/|_next/static|_next/image|icon|apple-icon|manifest|fonts|sw\\.js|.*\\.(?:png|jpg|svg|ico|webmanifest|woff)$).*)"],
};
