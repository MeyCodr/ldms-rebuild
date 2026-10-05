import { can } from "@/server/permissions";
import { buildOjtTemplate } from "@/server/services/ojtImport";
import { getCurrentUser } from "@/server/session";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in first", { status: 401 });
  if (user.mustChangePassword) return new Response("Change your password first", { status: 403 });
  if (!can(user, "ojt.manage")) return new Response("Forbidden", { status: 403 });

  const buffer = await buildOjtTemplate();
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="LDMS OJT import template.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
