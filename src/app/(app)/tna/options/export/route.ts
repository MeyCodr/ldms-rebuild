import { can } from "@/server/permissions";
import { tnaOptionsWorkbook } from "@/server/services/tnaOptions";
import { getCurrentUser } from "@/server/session";

/** The TNA training options as an Excel file: to look at, or to change and import again. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in first", { status: 401 });
  if (user.mustChangePassword) return new Response("Change your password first", { status: 403 });
  if (!can(user, "tna.manage")) return new Response("Forbidden", { status: 403 });

  const buffer = await (await tnaOptionsWorkbook(user)).xlsx.writeBuffer();
  return new Response(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="LDMS TNA training options.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
