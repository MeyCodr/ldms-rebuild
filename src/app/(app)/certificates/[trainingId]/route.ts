import { certificateForDownload } from "@/server/services/certificate";
import { getCurrentUser } from "@/server/session";

/** "attachment" with the file's name, plain-ASCII for old browsers and UTF-8 for the rest. */
function attachment(name: string) {
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

/**
 * A training's certificate, for L&D, anyone who completed the training, and
 * clerks for OJT of their staff. Anyone else, and a training without one, gets
 * "not found", so the link doesn't tell them whether a certificate exists.
 */
export async function GET(_request: Request, { params }: RouteContext<"/certificates/[trainingId]">) {
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in first", { status: 401 });
  if (user.mustChangePassword) return new Response("Change your password first", { status: 403 });

  const id = Number((await params).trainingId);
  const file = Number.isInteger(id) ? await certificateForDownload(user, id) : null;
  if (!file) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(file.bytes), {
    headers: {
      "Content-Type": file.mime,
      "Content-Disposition": attachment(file.name),
      "Content-Length": String(file.bytes.length),
      "Cache-Control": "private, no-store",
    },
  });
}
