import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Sidebar, type NavGroup } from "@/components/shell/Sidebar";
import { SIDEBAR_COOKIE } from "@/components/shell/sidebarCookie";
import { signOut } from "@/server/auth";
import { db } from "@/server/db";
import { nowInMalaysia } from "@/lib/format";
import { divisionTone } from "@/lib/tones";
import { feedbackWaiting } from "@/server/services/myTraining";
import { can, ROLE_LABELS } from "@/server/permissions";
import { requireUser } from "@/server/session";

async function doSignOut() {
  "use server";
  await signOut({ redirect: false });
  redirect("/login");
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Never redirect from a layout: during in-app navigation the browser keeps
  // the layout and only fetches the page, so a layout redirect loops. Pages
  // and actions call requireUser(), which sends someone with a temporary
  // password to /account.
  const user = await requireUser({ allowPendingPasswordChange: true });
  // Open with labels unless the person has collapsed it to an icon rail.
  const sidebarCollapsed = (await cookies()).get(SIDEBAR_COOKIE)?.value === "closed";

  // Navigation is grouped by what people do, and only lists screens the user
  // can open. Modules appear here as each phase ships.
  const groups: NavGroup[] = [{ items: [{ href: "/", label: "Overview", module: "overview" }] }];
  // Everyone has their own training; the count is feedback forms waiting for them.
  const waiting = (await feedbackWaiting(user, nowInMalaysia())).length;
  groups.push({ label: "My work", items: [{ href: "/my-training", label: "My training", module: "learning", count: waiting }] });
  const training: NavGroup["items"] = [];
  if (can(user, "training.view")) training.push({ href: "/trainings", label: "Trainings", module: "training" });
  if (can(user, "ojt.manage")) training.push({ href: "/ojt", label: "OJT", module: "ojt" });
  if (training.length) groups.push({ label: "Training", items: training });
  const records: NavGroup["items"] = [];
  if (can(user, "staff.view")) records.push({ href: "/staff", label: "Staff", module: "staff" });
  if (can(user, "org.view")) records.push({ href: "/organization", label: "Organization", module: "organization" });
  if (records.length) groups.push({ label: "Records", items: records });
  if (can(user, "audit.view")) groups.push({ label: "Administration", items: [{ href: "/audit", label: "Audit log", module: "audit" }] });

  const extra: string[] = user.roles.map((r) => ROLE_LABELS[r]);
  if (user.hodOfDepartmentIds.length || user.headOfDivisionIds.length) {
    const [depts, divs] = await Promise.all([
      db.department.findMany({ where: { id: { in: user.hodOfDepartmentIds } }, select: { shortName: true, name: true } }),
      db.division.findMany({ where: { id: { in: user.headOfDivisionIds } }, select: { name: true } }),
    ]);
    depts.forEach((d) => extra.push(`HOD, ${d.shortName ?? d.name}`));
    divs.forEach((d) => extra.push(`Head, ${d.name}`));
  }

  return (
    <div className="min-h-full-screen lg:flex">
      <Sidebar
        groups={groups}
        user={{ name: user.name, staffNo: user.staffNo, departmentName: user.departmentName, roleLabel: extra.join(" · "), tone: divisionTone(user.divisionId) }}
        signOut={doSignOut}
        defaultCollapsed={sidebarCollapsed}
      />
      <main className="min-w-0 flex-1 px-4 pt-7 pb-16 sm:px-6 lg:px-10">{children}</main>
    </div>
  );
}
