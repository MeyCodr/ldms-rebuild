import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Sidebar, type NavGroup } from "@/components/shell/Sidebar";
import { SIDEBAR_COOKIE } from "@/components/shell/sidebarCookie";
import { signOut } from "@/server/auth";
import { db } from "@/server/db";
import { nowInMalaysia } from "@/lib/format";
import { divisionTone } from "@/lib/tones";
import { feedbackWaiting } from "@/server/services/myTraining";
import { pmeWaiting } from "@/server/services/pme";
import { skillWaiting } from "@/server/services/skill";
import { seesSkillMatrices } from "@/server/rules/skill";
import { seesTeamTnas } from "@/server/rules/tna";
import { seesTnis } from "@/server/rules/tni";
import { tnaWaiting } from "@/server/services/tna";
import { can, hasApprovals, ROLE_LABELS } from "@/server/permissions";
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
  // Everyone has their own training; the count is what is waiting for them there:
  // feedback forms to fill in and PMEs to acknowledge.
  const today = nowInMalaysia();
  const [feedback, pme, skill, tna] = await Promise.all([feedbackWaiting(user, today), pmeWaiting(user, today), skillWaiting(user, today), tnaWaiting(user, today)]);
  const mine: NavGroup["items"] = [{ href: "/my-training", label: "My training", module: "learning", count: feedback.length + pme.toAcknowledge.length }];
  // My TNA: for those who fill in their own. The count: theirs was sent back.
  if (tna.fillsOwn) mine.push({ href: "/my-tna", label: "My TNA", module: "tna", count: tna.ownReturned ? 1 : 0 });
  groups.push({ label: "My work", items: mine });
  // Team: what HODs do for their staff, and L&D for everyone. The count is what is waiting on this person.
  const team: NavGroup["items"] = [];
  if (hasApprovals(user)) team.push({ href: "/approvals", label: "Approvals", module: "approvals", count: pme.toEvaluate.length + pme.toVerify.length + skill.toApprove.length + tna.toApprove.length });
  if (can(user, "pme.view")) team.push({ href: "/pme", label: "PME", module: "pme" });
  // The count: matrices this person filled in that the HOD sent back.
  if (seesSkillMatrices(user)) team.push({ href: "/skill-matrix", label: "Skill matrix", module: "skills", count: skill.returned });
  // The count: job-grade TNAs the main clerk filled in that the HOD sent back.
  if (seesTeamTnas(user)) team.push({ href: "/tna", label: "TNA", module: "tna", count: tna.gradesReturned });
  if (seesTnis(user)) team.push({ href: "/tni", label: "TNI", module: "tni" });
  const training: NavGroup["items"] = [];
  if (can(user, "training.view")) training.push({ href: "/trainings", label: "Trainings", module: "training" });
  if (can(user, "ojt.manage")) training.push({ href: "/ojt", label: "OJT", module: "ojt" });
  if (training.length) groups.push({ label: "Training", items: training });
  if (team.length) groups.push({ label: "Team", items: team });
  const records: NavGroup["items"] = [];
  if (can(user, "staff.view")) records.push({ href: "/staff", label: "Staff", module: "staff" });
  if (can(user, "org.view")) records.push({ href: "/organization", label: "Organization", module: "organization" });
  if (can(user, "report.view")) records.push({ href: "/reports", label: "Reports", module: "reports" });
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
