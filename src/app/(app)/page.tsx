import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CalendarClock, CalendarDays, CheckCircle2, ClipboardCheck, Clock, GraduationCap, History, MapPin, UserRound } from "lucide-react";
import { Avatar, DivisionMark } from "@/components/brand";
import { ColumnChart, type ColumnPoint } from "@/components/charts/ColumnChart";
import { DateChip } from "@/components/DateChip";
import { Panel } from "@/components/Panel";
import { CategoryTag, TrainingCover } from "@/components/TrainingCover";
import { EmptyState } from "@/components/ui/EmptyState";
import { Progress } from "@/components/ui/Progress";
import { Status } from "@/components/ui/Status";
import { daysAgo, formatDate, formatDateRange, formatHours, formatTime, nowInMalaysia, plural, startsIn, yearsOfService } from "@/lib/format";
import { divisionTone, TONE, type Tone } from "@/lib/tones";
import { DESIGNATION_LABELS, DESIGNATIONS } from "@/lib/validation/staff";
import { TRAINING_PLATFORM_LABELS, TRAINING_TYPE_LABELS } from "@/lib/validation/training";
import { db } from "@/server/db";
import { can } from "@/server/permissions";
import { approverReasonLabel, hasNoApproverByDesign } from "@/server/rules/approver";
import { isActiveHeadcount } from "@/server/rules/headcount";
import { approverFor, approvesCount } from "@/server/services/approver";
import { runDataChecks, type Check } from "@/server/services/checks";
import { myLearning, trainingOverview, type MyLearning, type TrainingOverview } from "@/server/services/dashboard";
import { feedbackWaiting, type MyTrainingRow } from "@/server/services/myTraining";
import { pmeWaiting, type PmeWaiting } from "@/server/services/pme";
import { skillWaiting, type SkillWaiting } from "@/server/services/skill";
import { tnaWaiting, type TnaWaiting } from "@/server/services/tna";
import { requireUser } from "@/server/session";

export const metadata: Metadata = { title: "Overview" };

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// Designation colours for the department make-up bar.
const DESIGNATION_TONE: Record<(typeof DESIGNATIONS)[number], Tone> = {
  MANAGER: "plum",
  EXECUTIVE: "cobalt",
  NON_EXECUTIVE: "jade",
  CONTRACT: "marigold",
  TRAINEE: "coral",
};

/** "Nor Azlina" from "Nor Azlina binti Hamid": the part before bin/binti/a/l/a/p. */
function givenName(name: string): string {
  return name.split(/\s+(?:bin|binti|bt|b\.|a\/l|a\/p)\s+/i)[0];
}

function greeting(today: Date): string {
  const h = today.getUTCHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

/** Twelve months of a year as chart points; months still to come are empty slots. */
function monthPoints(values: number[], year: number, today: Date): ColumnPoint[] {
  const current = today.getUTCFullYear() === year ? today.getUTCMonth() : 11;
  return values.map((value, i) => ({
    label: MONTHS[i].slice(0, 3),
    short: MONTHS[i][0],
    title: `${MONTHS[i]} ${year}`,
    value,
    future: i > current,
  }));
}

/** 48,600 → "48.6K", for figures in tiles. */
function compact(n: number): string {
  return n >= 10_000 ? `${(n / 1000).toLocaleString("en-MY", { maximumFractionDigits: 1 })}K` : n.toLocaleString("en-MY", { maximumFractionDigits: 0 });
}

export default async function OverviewPage() {
  const user = await requireUser();
  const today = nowInMalaysia();
  const isAdmin = can(user, "org.manage");
  const seesTraining = can(user, "training.view");

  const [me, approver, approves, learning, waiting, pme, skill, tna, training, checks, hodDepts, divisions] = await Promise.all([

    db.staff.findUniqueOrThrow({
      where: { id: user.id },
      include: { department: { include: { division: true } }, section: true },
    }),
    approverFor(user.id),
    approvesCount(user.id),
    myLearning(user, today),
    feedbackWaiting(user, today),
    pmeWaiting(user, today),
    skillWaiting(user, today),
    tnaWaiting(user, today),
    seesTraining ? trainingOverview(user, today) : Promise.resolve(null),
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
  const hasNext = learning.upcoming.length > 0;
  const records = [
    ...hodDepts.map((d) => <DepartmentMakeup key={d.id} department={d} />),
    ...(divisions ? [<DivisionHeadcount key="divisions" divisions={divisions} />] : []),
  ];

  return (
    <div className="flex flex-col gap-10">
      {/* ---------- Your learning ---------- */}
      <section aria-label="Your learning" className="grid gap-5 md:grid-cols-6 lg:grid-cols-12">
        <LearningHero
          className="md:col-span-6 lg:col-span-8"
          learning={learning}
          name={me.name}
          date={`${DAYS[today.getUTCDay()]}, ${formatDate(today)}`}
          hello={greeting(today)}
          role={me.position ?? DESIGNATION_LABELS[me.designation]}
          department={me.department.name}
          tone={tone}
        />
        {/* With something scheduled, the next training runs down beside the hero and the chart;
            with nothing, it stays compact and the chart takes the full width. */}
        <NextTraining className={`md:col-span-6 lg:col-span-4 ${hasNext ? "lg:row-span-2" : ""}`} learning={learning} today={today} />
        <Panel
          className={`md:col-span-6 ${hasNext ? "lg:col-span-8" : "lg:col-span-12"}`}
          title={`Your learning hours, ${learning.year}`}
          description="Completed trainings, by the month they started"
          action={learning.hoursThisYear > 0 && <span className="num font-semibold text-ink">{formatHours(learning.hoursThisYear)}</span>}
        >
          {learning.hoursThisYear > 0 ? (
            <ColumnChart
              data={monthPoints(learning.monthly, learning.year, today)}
              caption={`Your completed learning hours by month, ${learning.year}`}
              format={(n) => formatHours(n)}
            />
          ) : (
            <EmptyState compact icon={GraduationCap} title={`No completed training yet in ${learning.year}`}>
              Hours appear here as your trainings are completed.
              {learning.completedAllTime > 0 && (
                <>
                  {" "}
                  So far you have completed {plural(learning.completedAllTime, "training")}, {formatHours(learning.hoursAllTime)} in all.
                </>
              )}
            </EmptyState>
          )}
        </Panel>

        <RecentLearning className="md:col-span-6 lg:col-span-7" learning={learning} />
        <div className="grid content-start gap-5 md:col-span-6 md:grid-cols-2 lg:col-span-5 lg:grid-cols-1">
          <WaitingOnYou waiting={waiting} pme={pme} skill={skill} tna={tna} today={today} />
          <Panel title="Your approver">
            {approver?.approverId && approver.approver ? (
              <div className="flex items-center gap-3">
                <Avatar name={approver.approver.name} tone="slate" size={38} />
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
            <p className="mt-3 text-xs text-ink-3">Your PME, TNA and skill-matrix records go to this person for approval.</p>
            {approves > 0 && (
              <p className="mt-3 rounded-lg bg-sunken px-3 py-2 text-[13px]">
                You approve for <strong className="font-semibold">{plural(approves, "staff member", "staff")}</strong>.
              </p>
            )}
          </Panel>
        </div>
      </section>

      {/* ---------- Training at PHN (L&D) ---------- */}
      {training && <TrainingAtPhn training={training} today={today} />}

      {/* ---------- Records ---------- */}
      {(records.length > 0 || checks) && (
        <section aria-labelledby="records-heading" className="flex flex-col gap-4">
          <SectionHeading id="records-heading" title="People and organization" />
          <div className="grid items-start gap-5 lg:grid-cols-12">
            {records.length > 0 && (
              <div className={`grid gap-5 ${checks ? "lg:col-span-5" : records.length > 1 ? "md:grid-cols-2 lg:col-span-12" : "lg:col-span-12"}`}>
                {records}
              </div>
            )}
            {checks && (
              <div className={records.length ? "lg:col-span-7" : "lg:col-span-12"}>
                <DataChecks checks={checks} />
              </div>
            )}
          </div>
        </section>
      )}

      {/* ---------- Your record ---------- */}
      <section aria-labelledby="record-heading" className="flex flex-col gap-4">
        <SectionHeading id="record-heading" title="Your record" />
        <dl className="card grid gap-x-10 gap-y-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
          <Row label="Staff no.">
            <span className="num">{me.staffNo}</span>
          </Row>
          <Row label="Division">{me.department.division.name}</Row>
          <Row label="Department">{me.department.name}</Row>
          {me.section && <Row label="Section">{me.section.name}</Row>}
          <Row label="Designation">{DESIGNATION_LABELS[me.designation]}</Row>
          {me.dateJoined && (
            <Row label="With PHN">
              {yearsOfService(me.dateJoined, null)} <span className="text-ink-3">· since {formatDate(me.dateJoined)}</span>
            </Row>
          )}
          <Row label="Email">{me.email ?? <span className="text-ink-3">None on record</span>}</Row>
        </dl>
      </section>
    </div>
  );
}

function SectionHeading({ id, title, action }: { id: string; title: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-4">
      <h2 id={id} className="display text-[19px] font-semibold text-ink">
        {title}
      </h2>
      {action}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 text-[13.5px]">
      <dt className="text-xs text-ink-3">{label}</dt>
      <dd className="mt-0.5 break-words">{children}</dd>
    </div>
  );
}

// ---------- Your learning ----------

function LearningHero({
  className,
  learning,
  name,
  date,
  hello,
  role,
  department,
  tone,
}: {
  className: string;
  learning: MyLearning;
  name: string;
  date: string;
  hello: string;
  role: string;
  department: string;
  tone: Tone;
}) {
  const { year, hoursThisYear, completedThisYear, enrolledThisYear, upcoming } = learning;
  return (
    <section aria-labelledby="hello" className={`relative overflow-hidden rounded-xl bg-night p-6 text-white sm:p-7 ${className}`}>
      {/* The LDMS steps, faint, in the corner: the one accent on the hero. */}
      <svg aria-hidden viewBox="0 0 84 88" className="absolute right-6 bottom-0 hidden h-36 text-white opacity-[0.06] sm:block" fill="currentColor">
        {[34, 52, 70, 88].map((h, i) => (
          <rect key={h} x={i * 22} y={88 - h} width="16" height={h} rx="3" />
        ))}
      </svg>
      <div className="relative flex flex-col gap-6">
        <div className="flex items-start gap-4">
          <Avatar name={name} tone={tone} size={48} />
          <div className="min-w-0">
            <div className="text-[12.5px] text-night-muted">{date}</div>
            <h1 id="hello" className="display text-[26px] leading-tight font-semibold sm:text-[30px]">
              {hello}, {givenName(name)}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 text-[13px] text-night-text">
              <span>{role}</span>
              <span className="inline-flex items-center gap-1.5">
                <DivisionMark tone={tone} />
                {department}
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-x-10 gap-y-5">
          <div>
            <div className="text-[52px] leading-none font-semibold tracking-tight">
              {hoursThisYear.toLocaleString("en-MY", { maximumFractionDigits: 2 })}
              <span className="ml-1 text-[22px] font-medium text-night-muted">h</span>
            </div>
            <div className="mt-2 text-[13px] text-night-text">learning hours in {year}</div>
          </div>
          <dl className="flex gap-8 pb-0.5">
            <div>
              <dt className="text-[12.5px] text-night-muted">Completed</dt>
              <dd className="mt-0.5 text-[22px] font-semibold">{completedThisYear}</dd>
            </div>
            <div>
              <dt className="text-[12.5px] text-night-muted">Coming up</dt>
              <dd className="mt-0.5 text-[22px] font-semibold">{upcoming.length}</dd>
            </div>
          </dl>
        </div>

        <div className="max-w-lg">
          <div className="mb-2 flex justify-between gap-3 text-[12.5px] text-night-text">
            <span>
              {enrolledThisYear
                ? `${completedThisYear} of ${plural(enrolledThisYear, "training")} completed this year`
                : `You're not on any training in ${year} yet`}
            </span>
            {enrolledThisYear > 0 && <span className="num">{Math.round((completedThisYear / enrolledThisYear) * 100)}%</span>}
          </div>
          <Progress value={completedThisYear} max={Math.max(enrolledThisYear, 1)} label={`Trainings completed in ${year}`} tone="night" />
        </div>
      </div>
    </section>
  );
}

function NextTraining({ className, learning, today }: { className: string; learning: MyLearning; today: Date }) {
  const [next, ...later] = learning.upcoming;
  return (
    <section aria-labelledby="next-heading" className={`card flex flex-col p-5 ${className}`}>
      <div className="flex items-center justify-between gap-3">
        <h2 id="next-heading" className="display text-[15.5px] font-semibold">
          Next training
        </h2>
        {next && <span className="tag bg-accent-soft text-accent-deep">{startsIn(next.training, today)}</span>}
      </div>
      {next ? (
        <>
          <TrainingCover training={next.training} size="lg" className="mt-4" />
          <h3 className="mt-4 text-[17px] leading-snug font-semibold text-ink">
            <Link href={`/my-training/${next.id}`} className="hover:text-accent hover:underline">
              {next.training.title}
            </Link>
          </h3>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            <CategoryTag training={next.training} />
            {next.training.platform && <span className="tag">{TRAINING_PLATFORM_LABELS[next.training.platform]}</span>}
            <span className="tag">{TRAINING_TYPE_LABELS[next.training.type]}</span>
          </div>
          <ul className="mt-4 flex flex-col gap-2.5 border-t border-rule pt-4 text-[13px] text-ink-2">
            <li className="flex items-center gap-2.5">
              <CalendarDays size={15} aria-hidden className="text-ink-3" />
              <span className="num">{formatDateRange(next.training.startDate, next.training.endDate)}</span>
            </li>
            <li className="flex items-center gap-2.5">
              <Clock size={15} aria-hidden className="text-ink-3" />
              <span className="num">
                {formatTime(next.training.startTime)}–{formatTime(next.training.endTime)}
              </span>
              <span className="text-ink-3">· {formatHours(next.hours)}</span>
            </li>
            {next.training.venue && (
              <li className="flex items-center gap-2.5">
                <MapPin size={15} aria-hidden className="text-ink-3" />
                {next.training.venue}
              </li>
            )}
            {next.training.trainerName && (
              <li className="flex items-center gap-2.5">
                <UserRound size={15} aria-hidden className="text-ink-3" />
                {next.training.trainerName}
              </li>
            )}
          </ul>
          {later.length > 0 && (
            <div className="mt-auto pt-5">
              <div className="eyebrow mb-2">Also coming up</div>
              <ul className="flex flex-col">
                {later.slice(0, 3).map((p) => (
                  <li key={p.id} className="border-t border-rule">
                    <Link href={`/my-training/${p.id}`} className="group flex items-center gap-3 py-2.5">
                      <DateChip date={p.training.startDate} />
                      <div className="min-w-0">
                        <div className="truncate text-[13px] font-medium group-hover:text-accent group-hover:underline">{p.training.title}</div>
                        <div className="text-xs text-ink-3">
                          {startsIn(p.training, today)} · {formatHours(p.hours)}
                        </div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      ) : (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState icon={CalendarClock} title="Nothing scheduled">
            Trainings you&apos;re added to will show here, with the date, time and venue.
          </EmptyState>
        </div>
      )}
    </section>
  );
}

/** Things the person has to do: PMEs (their own to acknowledge, their staff's to evaluate, L&D's to verify), then feedback forms, most overdue first. */
function WaitingOnYou({ waiting, pme, skill, tna, today }: { waiting: MyTrainingRow[]; pme: PmeWaiting; skill: SkillWaiting; tna: TnaWaiting; today: Date }) {
  const pmeLines = [
    ...pme.toAcknowledge.map((p) => ({ href: `/pme/${p.id}`, title: p.training.title, sub: `PME to acknowledge · evaluated by ${p.evaluatedBy?.name ?? "your HOD"}` })),
    ...(pme.toEvaluate.length
      ? [{ href: "/approvals", title: `${plural(pme.toEvaluate.length, "PME")} to evaluate`, sub: "Your staff whose evaluation period has ended" }]
      : []),
    ...(pme.toVerify.length ? [{ href: "/approvals", title: `${plural(pme.toVerify.length, "PME")} to verify`, sub: "Evaluated and acknowledged" }] : []),
    ...(skill.toApprove.length
      ? [{ href: "/approvals", title: `${plural(skill.toApprove.length, "skill matrix", "skill matrices")} to approve`, sub: "Submitted by your department's evaluators" }]
      : []),
    ...(skill.returned
      ? [{ href: "/skill-matrix?stage=RETURNED", title: `${plural(skill.returned, "skill matrix", "skill matrices")} sent back to you`, sub: "Change and submit again" }]
      : []),
  ];
  const tnaLines = [
    ...(tna.toApprove.length ? [{ href: "/approvals", title: `${plural(tna.toApprove.length, "TNA")} to approve`, sub: "Submitted by your staff and your main clerk" }] : []),
    ...(tna.ownReturned ? [{ href: "/my-tna", title: "Your TNA was sent back", sub: "Change it and submit again" }] : []),
    ...(tna.gradesReturned ? [{ href: "/tna?view=grade&stage=RETURNED", title: `${plural(tna.gradesReturned, "job-grade TNA")} sent back to you`, sub: "Change and submit again" }] : []),
  ];
  const count = waiting.length + pme.toAcknowledge.length + pme.toEvaluate.length + pme.toVerify.length + skill.toApprove.length + skill.returned + tna.toApprove.length + (tna.ownReturned ? 1 : 0) + tna.gradesReturned;
  if (!count)
    return (
      <Panel title="Waiting on you">
        <div className="flex items-start gap-3.5">
          <span aria-hidden className={`flex size-10 shrink-0 items-center justify-center rounded-full ${TONE.jade.tile}`}>
            <CheckCircle2 size={19} />
          </span>
          <div>
            <p className="font-medium">You&apos;re all caught up.</p>
            <p className="mt-0.5 text-[13px] text-ink-2">
              Training feedback, PMEs, skill matrices and TNAs that need you are listed here, most urgent first.
            </p>
          </div>
        </div>
      </Panel>
    );
  return (
    <Panel
      title="Waiting on you"
      description={pmeLines.length + tnaLines.length ? "Approvals and forms, the longest waiting first" : "Feedback forms to fill in, the longest waiting first"}
      action={<Status tone="wait">{count} to do</Status>}
      flush
    >
      <ul>
        {[...pmeLines, ...tnaLines].map((l) => (
          <li key={l.href + l.title} className="border-b border-rule last:border-b-0">
            <Link href={l.href} className="group flex items-center gap-3 px-5 py-3 hover:bg-[#f8fafb]">
              <span aria-hidden className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${TONE.coral.tile}`}>
                <ClipboardCheck size={18} strokeWidth={1.9} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13.5px] font-medium text-ink group-hover:text-accent group-hover:underline">{l.title}</div>
                <div className="mt-0.5 truncate text-xs text-ink-3">{l.sub}</div>
              </div>
              <ArrowRight size={15} aria-hidden className="shrink-0 text-ink-3 group-hover:text-accent" />
            </Link>
          </li>
        ))}
        {waiting.slice(0, 4).map((r) => (
          <li key={r.id} className="border-b border-rule last:border-b-0">
            <Link href={`/my-training/${r.id}`} className="group flex items-center gap-3 px-5 py-3 hover:bg-[#f8fafb]">
              <TrainingCover training={r.training} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13.5px] font-medium text-ink group-hover:text-accent group-hover:underline">{r.training.title}</div>
                <div className="mt-0.5 text-xs text-ink-3">
                  Ended {daysAgo(r.training.endDate, today)} · {r.kind === "OJT" ? "3 short answers" : "feedback form"}
                </div>
              </div>
              <ArrowRight size={15} aria-hidden className="shrink-0 text-ink-3 group-hover:text-accent" />
            </Link>
          </li>
        ))}
      </ul>
      {waiting.length > 4 && (
        <Link href="/my-training" className="link block border-t border-rule px-5 py-2.5 text-[13px] font-medium">
          All {waiting.length} in My training
        </Link>
      )}
    </Panel>
  );
}

const ATTENDANCE_STATUS = {
  COMPLETED: { tone: "ok", label: "Completed" },
  PENDING: { tone: "wait", label: "Feedback due" },
  ABSENT: { tone: "na", label: "Absent" },
} as const;

function RecentLearning({ className, learning }: { className: string; learning: MyLearning }) {
  return (
    <Panel
      className={className}
      title="Recent learning"
      description="Trainings you were on that have been held"
      action={
        <Link href="/my-training" className="link inline-flex items-center gap-1 font-medium">
          My training <ArrowRight size={13} aria-hidden />
        </Link>
      }
    >
      {learning.recent.length ? (
        <div className="flex h-full flex-col gap-3">
          <ul className="-my-1 flex flex-col">
            {learning.recent.map((p) => {
              const s = ATTENDANCE_STATUS[p.attendance];
              return (
                <li key={p.id} className="border-b border-rule last:border-b-0">
                  <Link href={`/my-training/${p.id}`} className="group flex items-center gap-3 py-3">
                    <TrainingCover training={p.training} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13.5px] font-medium group-hover:text-accent group-hover:underline">{p.training.title}</div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 text-xs text-ink-3">
                        <span className="num">{formatDate(p.training.startDate)}</span>
                        <Status tone={s.tone}>{s.label}</Status>
                      </div>
                    </div>
                    <span className={`num shrink-0 text-[13px] font-medium ${p.counts ? "text-ink" : "text-ink-3"}`}>
                      {p.counts ? formatHours(p.hours) : "–"}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
          {/* All-time totals at the foot, so a short list still ends in a summary. */}
          <div className="mt-auto flex flex-wrap items-center gap-x-6 gap-y-1 border-t border-rule pt-4 text-[13px] text-ink-2">
            <span className="eyebrow">All time</span>
            <span>
              <span className="num font-semibold text-ink">{learning.completedAllTime}</span> completed
            </span>
            <span>
              <span className="num font-semibold text-ink">{formatHours(learning.hoursAllTime)}</span> of learning
            </span>
          </div>
        </div>
      ) : (
        <EmptyState compact icon={History} title="No trainings held yet">
          Trainings you attend will be listed here once they&apos;ve taken place.
        </EmptyState>
      )}
    </Panel>
  );
}

// ---------- Training at PHN ----------

function TrainingAtPhn({ training, today }: { training: TrainingOverview; today: Date }) {
  const { year, attendance } = training;
  const recorded = attendance.COMPLETED + attendance.ABSENT + attendance.PENDING;
  return (
    <section aria-labelledby="phn-heading" className="flex flex-col gap-4">
      <SectionHeading
        id="phn-heading"
        title={`Training at PHN, ${year}`}
        action={
          <Link href="/trainings" className="link inline-flex items-center gap-1 text-[13px] font-medium">
            All trainings <ArrowRight size={14} aria-hidden />
          </Link>
        }
      />
      <div className="grid gap-5 md:grid-cols-6 lg:grid-cols-12">
        {/* Compact figures beside the wide chart */}
        <div className="grid grid-cols-2 gap-5 md:col-span-6 md:grid-cols-4 lg:col-span-4 lg:grid-cols-2">
          <Stat
            label="Trainings"
            value={String(training.planned)}
            sub={`${training.heldCount} held${training.cancelled ? ` · ${training.cancelled} cancelled` : ""}`}
          />
          <Stat label="Hours delivered" value={compact(training.deliveredHours)} sub="completed, all staff" />
          <Stat
            label="Completion"
            value={recorded ? `${Math.round((attendance.COMPLETED / recorded) * 100)}%` : "–"}
            sub={recorded ? `${attendance.COMPLETED} of ${recorded} on held trainings` : "no trainings held yet"}
          >
            {recorded > 0 && (
              <Progress className="mt-3" size="sm" tone="ok" value={attendance.COMPLETED} max={recorded} label="Completed attendance on held trainings" />
            )}
          </Stat>
          <Stat label="Course cost" value={`RM ${compact(training.spend)}`} sub="trainings going ahead" />
        </div>
        <Panel
          className="md:col-span-6 lg:col-span-8"
          title="Learning hours delivered"
          description="Completed attendance across all staff, by the month the training started"
          action={<span className="num font-semibold text-ink">{formatHours(training.deliveredHours)}</span>}
        >
          <ColumnChart
            data={monthPoints(training.monthly, year, today)}
            caption={`Learning hours delivered by month, ${year}`}
            format={(n) => formatHours(n)}
            height={196}
          />
        </Panel>

        <Panel className="md:col-span-6 lg:col-span-7" title="Coming up" description="The next trainings on the calendar" flush>
          {training.upcoming.length ? (
            <ul>
              {training.upcoming.map((t) => (
                <li key={t.id} className="border-b border-rule last:border-b-0">
                  <Link href={`/trainings/${t.id}`} className="flex items-center gap-4 px-5 py-3.5 hover:bg-[#f8fafb]">
                    <TrainingCover training={t} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13.5px] font-medium text-ink">{t.title}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-ink-3">
                        <span className="num">{formatDateRange(t.startDate, t.endDate)}</span>
                        {t.venue && <span>{t.venue}</span>}
                        <CategoryTag training={t} />
                      </div>
                    </div>
                    <div className="hidden shrink-0 text-right sm:block">
                      <div className="text-[13px] font-medium text-accent-deep">{startsIn(t, today)}</div>
                      <div className="mt-0.5 text-xs text-ink-3">{t.participantCount ? plural(t.participantCount, "participant") : "No participants yet"}</div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState compact icon={CalendarClock} title="Nothing on the calendar">
              New trainings appear here once they&apos;re added.
            </EmptyState>
          )}
        </Panel>

        <Panel
          className="md:col-span-6 lg:col-span-5"
          title="Attendance to record"
          description="Held trainings with participants still pending"
          action={training.toRecord.length > 0 && <Status tone="wait">{training.toRecord.length} to do</Status>}
          flush
        >
          {training.toRecord.length ? (
            <ul>
              {training.toRecord.slice(0, 4).map((t) => (
                <li key={t.id} className="border-b border-rule last:border-b-0">
                  <Link href={`/trainings/${t.id}`} className="block px-5 py-3.5 hover:bg-[#f8fafb]">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="truncate text-[13.5px] font-medium text-ink">{t.title}</span>
                      <span className="num shrink-0 text-xs text-ink-3">{formatDate(t.endDate)}</span>
                    </div>
                    <div className="mt-2 flex items-center gap-3">
                      <Progress className="flex-1" size="sm" tone="ok" value={t.total - t.pending} max={t.total} label={`Attendance recorded for ${t.title}`} />
                      <span className="shrink-0 text-xs text-ink-2">
                        <span className="num font-medium text-ink">{t.pending}</span> pending
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState compact icon={CheckCircle2} title="All attendance recorded">
              Every held training this year has its attendance in.
            </EmptyState>
          )}
        </Panel>
      </div>
    </section>
  );
}

function Stat({ label, value, sub, children }: { label: string; value: string; sub?: string; children?: React.ReactNode }) {
  return (
    <div className="card flex flex-col p-4 sm:p-5">
      <div className="text-[12.5px] font-medium text-ink-3">{label}</div>
      <div className="mt-2 text-[28px] leading-none font-semibold tracking-tight text-ink">{value}</div>
      {sub && <div className="mt-2 text-xs text-ink-3">{sub}</div>}
      {children}
    </div>
  );
}

// ---------- People and organization ----------

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
      description="Active staff, trainees not counted"
      action={<span className="num text-[15px] font-semibold text-ink">{total}</span>}
    >
      <ul className="flex flex-col gap-3.5">
        {divisions.map((d) => {
          const t = TONE[divisionTone(d.id)];
          return (
            <li key={d.id}>
              <Link href={`/organization#division-${d.id}`} className="group block text-[13px]">
                <span className="flex items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-2">
                    <DivisionMark tone={divisionTone(d.id)} />
                    <span className="truncate group-hover:underline">{d.name}</span>
                  </span>
                  <span className="num font-medium">{d.headcount}</span>
                </span>
                <span className="mt-1.5 block h-2 rounded-full bg-sunken">
                  <span className={`block h-full rounded-full ${t.bar}`} style={{ width: `${(d.headcount / max) * 100}%` }} />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

function DepartmentMakeup({
  department,
}: {
  department: { id: number; name: string; staff: { status: "ACTIVE" | "RESIGNED"; designation: (typeof DESIGNATIONS)[number] }[] };
}) {
  const headcount = department.staff.filter(isActiveHeadcount).length;
  const counts = DESIGNATIONS.map((d) => ({ d, n: department.staff.filter((s) => s.designation === d).length })).filter((c) => c.n > 0);
  const total = department.staff.length || 1;
  return (
    <Panel
      title={`Your department · ${department.name}`}
      action={
        <Link href={`/staff?departmentId=${department.id}`} className="link inline-flex items-center gap-1 font-medium">
          Staff list <ArrowRight size={13} aria-hidden />
        </Link>
      }
    >
      <div className="flex items-baseline gap-2">
        <span className="text-[32px] leading-none font-semibold tracking-tight">{headcount}</span>
        <span className="text-[13px] text-ink-2">headcount (trainees not counted)</span>
      </div>
      <div
        className="mt-4 flex h-2.5 gap-[2px] overflow-hidden rounded-full"
        role="img"
        aria-label={counts.map((c) => `${c.n} ${DESIGNATION_LABELS[c.d]}`).join(", ")}
      >
        {counts.map((c) => (
          <span key={c.d} className={TONE[DESIGNATION_TONE[c.d]].bar} style={{ width: `${(c.n / total) * 100}%` }} />
        ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[13px]">
        {counts.map((c) => (
          <li key={c.d} className="flex items-center gap-1.5">
            <span aria-hidden className={`size-2 rounded-[2px] ${TONE[DESIGNATION_TONE[c.d]].bar}`} />
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
      description="The migration to v2 runs these same checks and stops on anything that blocks migration."
      action={open ? <Status tone="wait">{open} to resolve</Status> : <Status tone="ok">All clear</Status>}
    >
      <ul>
        {checks.map((c) => {
          const sev = SEVERITY[c.severity];
          const clear = c.count === 0;
          return (
            <li key={c.key} className="flex gap-4 border-b border-rule px-5 py-3.5 last:border-b-0">
              <span
                className={`num flex h-9 min-w-11 shrink-0 items-center justify-center rounded-lg px-2 text-[15px] font-semibold ${clear ? "bg-ok-soft text-ok" : sev.count}`}
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
