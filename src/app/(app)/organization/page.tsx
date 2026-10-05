import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Building2, ChevronRight, Network, UserRound, Users } from "lucide-react";
import { Avatar, DivisionMark } from "@/components/brand";
import { PageHeader } from "@/components/PageHeader";
import { ClickableRow } from "@/components/ui/ClickableRow";
import { Status } from "@/components/ui/Status";
import { plural } from "@/lib/format";
import { divisionTone } from "@/lib/tones";
import { can } from "@/server/permissions";
import { getOrgTree, headCandidates } from "@/server/services/org";
import { requirePermission } from "@/server/session";
import { createDepartmentAction, createDivisionAction, deleteDivisionAction, setDivisionHeadAction, setHodAction, updateDivisionAction } from "./actions";
import { ConfirmDialog, HeadDialog, NameDialog } from "./OrgForms";

export const metadata: Metadata = { title: "Organization" };

type Tree = Awaited<ReturnType<typeof getOrgTree>>;
type Candidates = Awaited<ReturnType<typeof headCandidates>>;

export default async function OrganizationPage({ searchParams }: PageProps<"/organization">) {
  const user = await requirePermission("org.view");

  // Links from before the redesign used ?dept= and ?div=.
  const sp = await searchParams;
  if (typeof sp.dept === "string" && /^\d+$/.test(sp.dept)) redirect(`/organization/departments/${sp.dept}`);
  if (typeof sp.div === "string" && /^\d+$/.test(sp.div)) redirect(`/organization#division-${sp.div}`);

  const manage = can(user, "org.manage");
  const [tree, candidates] = await Promise.all([getOrgTree(), manage ? headCandidates() : Promise.resolve([] as Candidates)]);

  const departments = tree.flatMap((d) => d.departments.map((dep) => ({ ...dep, division: d })));
  const totalStaff = departments.reduce((n, d) => n + d.activeStaff, 0);
  const needHod = departments.filter((d) => !d.hod || d.hod.status !== "ACTIVE");

  return (
    <div>
      <PageHeader
        module="organization"
        context="Records"
        title="Organization"
        meta={
          <span>
            {plural(tree.length, "division")} · {plural(departments.length, "department")} · {plural(totalStaff, "active staff member", "active staff")}
          </span>
        }
        actions={manage && <NameDialog label="Add division" title="Add a division" description="A division groups related departments, for example Manufacturing or Quality." action={createDivisionAction} submit="Add division" variant="primary" />}
      />

      <HowItWorks />

      {needHod.length > 0 && (
        <section aria-labelledby="attention" className="mt-5 rounded-lg border border-wait/40 bg-wait-soft/60">
          <h2 id="attention" className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-wait/25 px-5 py-2.5 text-[13.5px] font-semibold text-ink">
            <Status tone="wait">Needs attention</Status>
            <span className="font-normal text-ink-2">
              {plural(needHod.length, "department has", "departments have")} no HOD, so their staff have no one to approve their records.
            </span>
          </h2>
          <ul>
            {needHod.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-wait/20 px-5 py-2.5 last:border-b-0">
                <div className="flex min-w-0 items-center gap-2.5 text-[13.5px]">
                  <DivisionMark tone={divisionTone(d.division.id)} />
                  <Link href={`/organization/departments/${d.id}`} className="link font-medium">
                    {d.name}
                  </Link>
                  <span className="text-ink-3">
                    {d.division.name} · {plural(d.activeStaff, "staff member", "staff")} waiting for an approver
                  </span>
                </div>
                {manage && (
                  <HeadDialog
                    label="Assign HOD"
                    variant="primary"
                    title={`Choose the HOD of ${d.name}`}
                    description="This person will approve PME, TNA and skill-matrix records for everyone in the department."
                    action={setHodAction.bind(null, d.id)}
                    currentId={null}
                    candidates={candidates}
                    preferDepartment={d.name}
                  />
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-6 flex flex-col gap-6">
        {tree.map((division) => (
          <DivisionPanel key={division.id} division={division} manage={manage} candidates={candidates} />
        ))}
        {tree.length === 0 && (
          <div className="rounded-lg border border-dashed border-rule-strong bg-surface px-6 py-10 text-center">
            <p className="font-medium">No divisions yet</p>
            <p className="mt-1 text-[13px] text-ink-2">Start by adding a division, then add its departments.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function HowItWorks() {
  const steps = [
    { icon: Building2, title: "Division", text: "Groups related departments, e.g. Manufacturing." },
    { icon: Network, title: "Department", text: "Has one HOD, who approves its staff's PME, TNA and skill matrix." },
    { icon: Users, title: "Section (optional)", text: "Splits a department into teams, e.g. Press Line A." },
    { icon: UserRound, title: "Staff", text: "Belong to one department. Move them with Transfer." },
  ];
  return (
    <details open className="group mt-1 card">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-2.5 text-[13px] font-medium text-ink-2 hover:text-ink [&::-webkit-details-marker]:hidden">
        <ChevronRight size={15} aria-hidden className="transition-transform group-open:rotate-90" />
        How the org chart works
      </summary>
      <ol className="grid gap-x-2 gap-y-3 border-t border-rule px-5 py-4 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((s, i) => (
          <li key={s.title} className="flex gap-3">
            <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-md bg-plum-soft text-plum-deep">
              <s.icon size={16} />
            </span>
            <div className="text-[13px]">
              <div className="font-semibold text-ink">
                <span className="num mr-1 text-ink-3">{i + 1}.</span>
                {s.title}
              </div>
              <div className="text-ink-2">{s.text}</div>
            </div>
          </li>
        ))}
      </ol>
    </details>
  );
}

function DivisionPanel({ division, manage, candidates }: { division: Tree[number]; manage: boolean; candidates: Candidates }) {
  const tone = divisionTone(division.id);
  const headActive = division.head?.status === "ACTIVE";
  const staff = division.departments.reduce((n, d) => n + d.activeStaff, 0);

  return (
    <section id={`division-${division.id}`} aria-labelledby={`division-${division.id}-title`} className="scroll-mt-6 card">
      <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 border-b border-rule px-5 py-4">
        <div className="min-w-0">
          <div className="text-xs font-medium tracking-wide text-ink-3 uppercase">Division</div>
          <h2 id={`division-${division.id}-title`} className="display mt-0.5 flex items-center gap-2 text-lg font-semibold">
            <DivisionMark tone={tone} className="size-2.5" />
            {division.name}
            {division.shortName && <span className="num text-sm font-normal text-ink-3">{division.shortName}</span>}
          </h2>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-ink-2">
            <span>
              {plural(division.departments.length, "department")} · {plural(staff, "active staff member", "active staff")}
            </span>
            <span className="flex items-center gap-1.5">
              Division head:
              {division.head && headActive ? (
                <Link href={`/staff/${division.head.id}`} className="link">
                  {division.head.name}
                </Link>
              ) : (
                <span className="text-ink-3">not set (optional)</span>
              )}
            </span>
          </div>
        </div>
        {manage && (
          <div className="flex flex-wrap items-center gap-1.5">
            <HeadDialog
              label={division.head && headActive ? "Change division head" : "Set division head"}
              title={`Head of ${division.name}`}
              description="Recorded for the org chart. The division head has no approval role in LDMS."
              action={setDivisionHeadAction.bind(null, division.id)}
              currentId={headActive ? division.head!.id : null}
              candidates={candidates}
            />
            <NameDialog label="Rename" title={`Rename ${division.name}`} action={updateDivisionAction.bind(null, division.id)} initial={division} submit="Save" size="sm" />
            <ConfirmDialog
              label="Delete"
              size="sm"
              title={`Delete ${division.name}?`}
              description={
                division.departments.length
                  ? `You can't delete this division yet: it still has ${plural(division.departments.length, "department")}. Open each department and use "Edit details" to move it to another division first.`
                  : "This division has no departments. Deleting it can't be undone."
              }
              action={deleteDivisionAction.bind(null, division.id)}
              confirm="Delete division"
            />
          </div>
        )}
      </header>

      {division.departments.length > 0 && (
        // Phones: one stacked row per department instead of a wide table.
        <ul className="sm:hidden">
          {division.departments.map((d) => {
            const hodActive = d.hod?.status === "ACTIVE";
            return (
              <li key={d.id} className="border-b border-rule last:border-b-0">
                <Link href={`/organization/departments/${d.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-sunken">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-accent">{d.name}</div>
                    <div className="mt-0.5 text-[13px] text-ink-2">
                      {d.hod && hodActive ? <>HOD: {d.hod.name}</> : <Status tone="wait">No HOD</Status>}
                    </div>
                    <div className="text-xs text-ink-3">
                      {plural(d.activeStaff, "active staff member", "active staff")}
                      {d._count.sections ? ` · ${plural(d._count.sections, "section")}` : ""}
                    </div>
                  </div>
                  <ArrowRight size={16} aria-hidden className="shrink-0 text-ink-3" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {division.departments.length > 0 ? (
        <div className="hidden overflow-x-auto sm:block">
          {/* Fixed column widths so every division's table lines up down the page. */}
          <table className="table table-fixed">
            <thead>
              <tr>
                <th className="w-14 pl-5 text-right">No.</th>
                <th className="w-[40%]">Department</th>
                <th>Head of department</th>
                <th className="hidden w-24 text-right sm:table-cell">Sections</th>
                <th className="w-28 text-right">Active staff</th>
                <th className="w-12 pr-5">
                  <span className="sr-only">Open</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {division.departments.map((d, i) => {
                const hodActive = d.hod?.status === "ACTIVE";
                return (
                  <ClickableRow key={d.id} href={`/organization/departments/${d.id}`}>
                    <td className="num muted py-2.5 pl-5 text-right align-middle">{i + 1}</td>
                    <td className="py-2.5 align-middle">
                      <Link href={`/organization/departments/${d.id}`} className="link font-medium">
                        {d.name}
                      </Link>
                      {d.shortName && <span className="num ml-2 text-xs text-ink-3">{d.shortName}</span>}
                    </td>
                    <td className="py-2 align-middle">
                      {d.hod && hodActive ? (
                        <span className="flex items-center gap-2">
                          <Avatar name={d.hod.name} tone={tone} size={26} />
                          {d.hod.name}
                        </span>
                      ) : (
                        <span className="flex flex-wrap items-center gap-3">
                          <Status tone="wait">No HOD</Status>
                          {manage && (
                            <HeadDialog
                              label="Assign"
                              title={`Choose the HOD of ${d.name}`}
                              description="This person will approve PME, TNA and skill-matrix records for everyone in the department."
                              action={setHodAction.bind(null, d.id)}
                              currentId={null}
                              candidates={candidates}
                              preferDepartment={d.name}
                            />
                          )}
                        </span>
                      )}
                    </td>
                    <td className="num hidden py-2.5 text-right align-middle sm:table-cell">{d._count.sections || <span className="text-ink-3">–</span>}</td>
                    <td className="num py-2.5 text-right align-middle">{d.activeStaff}</td>
                    <td className="py-2.5 pr-5 align-middle">
                      <Link href={`/organization/departments/${d.id}`} aria-label={`Open ${d.name}`} className="flex justify-end text-ink-3 hover:text-accent">
                        <ArrowRight size={16} />
                      </Link>
                    </td>
                  </ClickableRow>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="px-5 py-5 text-[13px] text-ink-2">No departments in this division yet.</p>
      )}

      {manage && (
        <div className="border-t border-rule px-4 py-2.5">
          <NameDialog
            label={`+ Add department to ${division.name}`}
            title={`Add a department to ${division.name}`}
            description="You can choose its HOD and add sections after it is created."
            action={createDepartmentAction.bind(null, division.id)}
            submit="Add department"
            size="sm"
            variant="ghost"
          />
        </div>
      )}
    </section>
  );
}
