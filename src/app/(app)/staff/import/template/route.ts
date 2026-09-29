import { can } from "@/server/permissions";
import { buildImportTemplate } from "@/server/services/staffImport";
import { getCurrentUser } from "@/server/session";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in first", { status: 401 });
  if (user.mustChangePassword) return new Response("Change your password first", { status: 403 });
  if (!can(user, "staff.import")) return new Response("Forbidden", { status: 403 });

  const buffer = await buildImportTemplate();
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="LDMS staff import template.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
