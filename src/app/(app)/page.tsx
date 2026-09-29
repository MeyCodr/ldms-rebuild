import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { Avatar, DivisionMark } from "@/components/brand";
import { PageHeader } from "@/components/PageHeader";
import { Panel } from "@/components/Panel";
import { Status } from "@/components/ui/Status";
import { formatDate, nowInMalaysia, plural, yearsOfService } from "@/lib/format";
import { divisionTone, TONE, type Tone } from "@/lib/tones";
import { DESIGNATION_LABELS, DESIGNATIONS } from "@/lib/validation/staff";
import { db } from "@/server/db";
import { can } from "@/server/permissions";
import { approverReasonLabel, hasNoApproverByDesign } from "@/server/rules/approver";
import { isActiveHeadcount } from "@/server/rules/headcount";
import { approverFor, approvesCount } from "@/server/services/approver";
import { runDataChecks, type Check } from "@/server/services/checks";
import { requireUser } from "@/server/session";

export const metadata: Metadata = { title: "Overview" };

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// Designation colours for the department make-up bar.
const DESIGNATION_TONE: Record<(typeof DESIGNATIONS)[number], Tone> = {
  MANAGER: "plum",
  EXECUTIVE: "cobalt",
  NON_EXECUTIVE: "jade",
  CONTRACT: "marigold",
  TRAINEE: "coral",
};

export default async function OverviewPage() {
  const user = await requireUser();
  const today = nowInMalaysia();
  const isAdmin = can(user, "org.manage");

  const [me, approver, approves, checks, hodDepts, divisions] = await Promise.all([
    db.staff.findUniqueOrThrow({
      where: { id: user.id },
      include: { department: { include: { division: true } }, section: true },
    }),
    approverFor(user.id),
    approvesCount(user.id),
    isAdmin ? runDataChecks() : Promise.resolve(null),
    user.hodOfDepartmentIds.length
      ? db.department.findMany({
          where: { id: { in: user.hodOfDepartmentIds } },
          include: { staff: { where: { status: "ACTIVE" }, select: { status: true, designation: true } } },
        })
      : Promise.resolve([]),
    isAdmin ? divisionHeadcount() : Promise.resolve(null),
  ]);
  const tone = divisionTone(me.department.divisionId);

  return (
    <div className="mx-auto max-w-[1200px]">
      <PageHeader
        module="overview"
        leading={<Avatar name={me.name} tone={tone} size={46} />}
        context={`${DAYS[today.getUTCDay()]}, ${formatDate(today)}`}
        title={me.name}
        meta={
          <>
            <span>{me.position ?? DESIGNATION_LABELS[me.designation]}</span>
            <span className="inline-flex items-center gap-1.5">
              <DivisionMark tone={tone} />
              {me.department.name}
            </span>
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-5">
          <Panel title="Waiting on you">
            <div className="flex items-start gap-3.5">
              <span aria-hidden className={`flex size-9 shrink-0 items-center justify-center rounded-full ${TONE.jade.tile}`}>
                <CheckCircle2 size={19} />
              </span>
              <div>
                <p className="font-medium">You&apos;re all caught up.</p>
                <p className="mt-0.5 text-[13px] text-ink-2">
                  Training feedback, PME evaluations and TNA approvals that need you will be listed here, most urgent first.
                </p>
              </div>
            </div>
          </Panel>

          {hodDepts.map((d) => (
            <DepartmentMakeup key={d.id} department={d} />
          ))}

          {divisions && <DivisionHeadcount divisions={divisions} />}
          {checks && <DataChecks checks={checks} />}
        </div>

        <aside className="flex flex-col gap-5">
          <Panel title="Your approver">
            {approver?.approverId && approver.approver ? (
              <div className="flex items-center gap-3">
                <Avatar name={approver.approver.name} tone="slate" size={36} />
                <div className="min-w-0">
                  <div className="font-medium">{approver.approver.name}</div>
                  <div className="text-xs text-ink-3">HOD of your department</div>
                </div>
              </div>
            ) : approver && approver.basis === "NONE" ? (
              <div>
                <Status tone={hasNoApproverByDesign(approver) ? "na" : "wait"}>{approverReasonLabel[approver.reason]}</Status>
                {!hasNoApproverByDesign(approver) && <p className="mt-1 text-xs text-ink-3">Tell the L&amp;D unit so they can set it up.</p>}
              </div>
            ) : null}
            <p className="mt-3 border-t border-rule pt-3 text-xs text-ink-3">Your PME, TNA and skill-matrix records go to this person for approval.</p>
            {approves > 0 && (
              <p className="mt-2 text-[13px]">
                You approve for <strong className="font-semibold">{plural(approves, "staff member", "staff")}</strong>.
              </p>
            )}
          </Panel>

          <Panel title="Your record">
            <dl className="-my-1 text-[13px]">
              <Row label="Staff no.">
                <span className="num">{me.staffNo}</span>
              </Row>
              <Row label="Division">{me.department.division.name}</Row>
              {me.section && <Row label="Section">{me.section.name}</Row>}
              <Row label="Designation">{DESIGNATION_LABELS[me.designation]}</Row>
              {me.dateJoined && (
                <Row label="With PHN">
                  {yearsOfService(me.dateJoined, null)} <span className="text-ink-3">· since {formatDate(me.dateJoined)}</span>
                </Row>
              )}
              <Row label="Email">{me.email ?? <span className="text-ink-3">None on record</span>}</Row>
            </dl>
          </Panel>
        </aside>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[92px_1fr] gap-3 border-b border-rule py-2 last:border-b-0">
      <dt className="text-ink-3">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

async function divisionHeadcount() {
  const [divisions, staff] = await Promise.all([
    db.division.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.staff.findMany({ where: { status: "ACTIVE" }, select: { status: true, designation: true, department: { select: { divisionId: true } } } }),
  ]);
  return divisions.map((d) => ({
    ...d,
    headcount: staff.filter((s) => s.department.divisionId === d.id && isActiveHeadcount(s)).length,
  }));
}

function DivisionHeadcount({ divisions }: { divisions: { id: number; name: string; headcount: number }[] }) {
  const total = divisions.reduce((n, d) => n + d.headcount, 0);
  const max = Math.max(1, ...divisions.map((d) => d.headcount));
  return (
    <Panel
      title="Headcount by division"
      action={
        <span className="text-ink-2">
          <span className="num font-medium text-ink">{total}</span> active, trainees excluded
        </span>
      }
    >
      <ul className="flex flex-col gap-3">
        {divisions.map((d) => {
          const t = TONE[divisionTone(d.id)];
          return (
            <li key={d.id}>
              <Link href={`/organization#division-${d.id}`} className="group grid grid-cols-[150px_1fr_40px] items-center gap-3 text-[13px] sm:grid-cols-[180px_1fr_44px]">
                <span className="flex min-w-0 items-center gap-2">
                  <DivisionMark tone={divisionTone(d.id)} />
                  <span className="truncate group-hover:underline">{d.name}</span>
                </span>
                <span className={`h-2.5 rounded-full ${t.soft}`}>
                  <span className={`block h-full rounded-full ${t.bar}`} style={{ width: `${(d.headcount / max) * 100}%` }} />
                </span>
                <span className="num text-right font-medium">{d.headcount}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

function DepartmentMakeup({ department }: { department: { id: number; name: string; staff: { status: "ACTIVE" | "RESIGNED"; designation: (typeof DESIGNATIONS)[number] }[] } }) {
  const headcount = department.staff.filter(isActiveHeadcount).length;
  const counts = DESIGNATIONS.map((d) => ({ d, n: department.staff.filter((s) => s.designation === d).length })).filter((c) => c.n > 0);
  const total = department.staff.length || 1;
  return (
    <Panel
      title={`Your department · ${department.name}`}
      action={
        <Link href={`/staff?departmentId=${department.id}`} className="link inline-flex items-center gap-1">
          Staff list <ArrowRight size={13} aria-hidden />
        </Link>
      }
    >
      <div className="flex items-baseline gap-2">
        <span className="display text-3xl font-semibold">{headcount}</span>
        <span className="text-[13px] text-ink-2">headcount (trainees not counted)</span>
      </div>
      <div className="mt-3 flex h-2.5 overflow-hidden rounded-full" role="img" aria-label={counts.map((c) => `${c.n} ${DESIGNATION_LABELS[c.d]}`).join(", ")}>
        {counts.map((c) => (
          <span key={c.d} className={`${TONE[DESIGNATION_TONE[c.d]].bar} border-r-2 border-surface last:border-r-0`} style={{ width: `${(c.n / total) * 100}%` }} />
        ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[13px]">
        {counts.map((c) => (
          <li key={c.d} className="flex items-center gap-1.5">
            <span aria-hidden className={`size-2 rounded-full ${TONE[DESIGNATION_TONE[c.d]].bar}`} />
            {DESIGNATION_LABELS[c.d]} <span className="num text-ink-3">{c.n}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

const SEVERITY: Record<Check["severity"], { tone: "bad" | "wait" | "na"; label: string; count: string }> = {
  blocks: { tone: "bad", label: "Blocks migration", count: "bg-bad-soft text-bad" },
  warns: { tone: "wait", label: "Should fix", count: "bg-wait-soft text-wait" },
  info: { tone: "na", label: "For information", count: "bg-sunken text-ink-2" },
};

function DataChecks({ checks }: { checks: Check[] }) {
  const open = checks.filter((c) => c.count > 0 && c.severity !== "info").length;
  return (
    <Panel
      flush
      title="Org and staff data checks"
      action={open ? <Status tone="wait">{open} to resolve</Status> : <Status tone="ok">All clear</Status>}
    >
      <p className="border-b border-rule px-5 py-2.5 text-[13px] text-ink-2">The migration to v2 runs these same checks and stops on anything that blocks migration.</p>
      <ul>
        {checks.map((c) => {
          const sev = SEVERITY[c.severity];
          const clear = c.count === 0;
          return (
            <li key={c.key} className="flex gap-4 border-b border-rule px-5 py-3 last:border-b-0">
              <span
                className={`num flex h-9 min-w-11 shrink-0 items-center justify-center rounded-md px-2 text-[15px] font-medium ${clear ? "bg-ok-soft text-ok" : sev.count}`}
              >
                {clear ? <CheckCircle2 size={17} aria-label="Clear" /> : c.count}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  {c.href && !clear ? (
                    <Link href={c.href} className="link font-medium">
                      {c.label}
                    </Link>
                  ) : (
                    <span className={`font-medium ${clear ? "text-ink-2" : ""}`}>{c.label}</span>
                  )}
                  {!clear && (
                    <span className="text-xs">
                      <Status tone={sev.tone}>{sev.label}</Status>
                    </span>
                  )}
                </div>
                <div className="text-[13px] text-ink-3">{c.why}</div>
                {c.items && c.items.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[13px]">
                    {c.items.map((i) => (
                      <Link key={i.href} href={i.href} className="link">
                        {i.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
