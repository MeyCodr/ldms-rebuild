import { NextRequest } from "next/server";
import { BASE_PATH } from "@/lib/base-path";
import { handlers } from "@/server/auth";

// Route handlers see the URL without the app's base path (/api/auth/session),
// but Auth.js is configured with the full path (/phn-ldms/api/auth) so that
// server-side sign-in builds the right URLs. Put the base path back first.
function withBase(handler: (req: NextRequest) => Promise<Response>) {
  return (req: NextRequest) => {
    const url = new URL(req.url);
    if (!url.pathname.startsWith(`${BASE_PATH}/`)) url.pathname = `${BASE_PATH}${url.pathname}`;
    return handler(new NextRequest(url, req));
  };
}

export const GET = withBase(handlers.GET);
export const POST = withBase(handlers.POST);
