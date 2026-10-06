import { redirect } from "next/navigation";
import { requirePermission } from "@/server/session";

/** Reports opens on the first of them. */
export default async function ReportsPage() {
  await requirePermission("report.view");
  redirect("/reports/staff-hours");
}
