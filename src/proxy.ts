import { NextResponse, type NextRequest } from "next/server";

// Route guard. This is only an early redirect for signed-out visitors: every
// page and server action still checks the session and permissions itself.
const SESSION_COOKIES = ["authjs.session-token", "__Secure-authjs.session-token"];

export function proxy(request: NextRequest) {
  const signedIn = SESSION_COOKIES.some((name) => request.cookies.has(name));
  if (signedIn) return NextResponse.next();

  const url = request.nextUrl.clone();
  const from = request.nextUrl.pathname + request.nextUrl.search;
  url.pathname = "/login";
  url.search = from === "/" ? "" : `?from=${encodeURIComponent(from)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!login|api/auth|_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
