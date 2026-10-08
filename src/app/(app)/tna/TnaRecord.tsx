import Link from "next/link";
import { CalendarRange, ListChecks, Pencil, UserCheck, UserRound, Users } from "lucide-react";
import { HistoryPanel, type HistoryFields } from "@/components/HistoryPanel";
import { Panel } from "@/components/Panel";
import { Fact, Row } from "@/components/RecordParts";
import { Status } from "@/components/ui/Status";
import { monthLabel, TNA_LEVELS, TNA_METHOD_LABELS, TNA_SECTION_HINTS, TNA_SECTIONS, tnaGap, tnaSectionTitle } from "@/lib/forms/tna";
import { formatDateTime, formatHours, plural } from "@/lib/format";
import { DESIGNATION_LABELS } from "@/lib/validation/staff";
import { can, type SessionUser } from "@/server/permissions";
import { TNA_STAGE_LABELS, TNA_STAGE_TONE, tnaTitle, tnaYearBlock } from "@/server/rules/tna";
import type { tnaHistory, tnaTrainingHours, TnaView } from "@/server/services/tna";
import { ApproveTnaDialog, DeleteTnaDialog, ReopenTnaDialog, SendBackTnaDialog, SubmitTnaDialog } from "./TnaActions";

// The parts of a TNA's page, shared by My TNA (the person's own) and the
// Team screen's record page (the HOD, the main clerk, L&D, the division head).

const SAVED: Record<string, string> = {
  draft: "Draft saved. Submit it to the HOD when it's complete.",
  submitted: "Submitted. The HOD can now approve it, change it or send it back.",
  changed: "Changes saved. It is still waiting for approval.",
  approved: "Saved and approved. It is now locked; L&D can reopen it.",
};

const HISTORY_FIELDS: HistoryFields = {
  status: { label: "Status", format: (v) => ({ DRAFT: "Draft", SUBMITTED: "Waiting for HOD", APPROVED: "Approved" })[String(v)] ?? String(v) },
  rows: { label: "Rows" },
  reason: { label: "Reason", listing: true },
};

/** How the TNA is named in a dialog's title: "your TNA", "Siti's TNA", "the TNA for Stamping, job grade 3". */
const dialogTitle = (t: TnaView) => (t.viewer.isOwner ? "your TNA" : tnaTitle(t.owner));

/** The buttons in the page header: each shows only to who may take that step, when they may. */
export function TnaHeaderActions({ t, editHref }: { t: TnaView; editHref: string }) {
  const title = dialogTitle(t);
  return (
    <>
      {t.blocked.EDIT === null && (
        <Link href={editHref} className="btn">
          <Pencil size={14} aria-hidden /> Edit
        </Link>
      )}
      {t.viewer.canFill && (
        <>
          <SubmitTnaDialog id={t.id} title={title} hodName={t.approver?.name ?? null} hidden={t.blocked.SUBMIT !== null} />
          <DeleteTnaDialog id={t.id} title={title} hidden={t.blocked.DELETE !== null} />
        </>
      )}
      {t.viewer.isApprover && (
        <>
          <SendBackTnaDialog id={t.id} title={title} hidden={t.blocked.SEND_BACK !== null} />
          <ApproveTnaDialog ids={[t.id]} title={`Approve ${title}`} hidden={t.blocked.APPROVE !== null} />
        </>
      )}
      {t.viewer.isAdmin && <ReopenTnaDialog id={t.id} title={title} hidden={t.blocked.REOPEN !== null} />}
    </>
  );
}

/** What the page says above the record: what was just saved, why it was sent back, a year that is closed, a department without a HOD. */
export function TnaNotices({ t, saved, open }: { t: TnaView; saved: string | string[] | undefined; /** The year being filled in. */ open: number }) {
  const closed = tnaYearBlock(t.year, open);
  return (
    <>
      {typeof saved === "string" && SAVED[saved] && (
        <div role="status" className="notice notice-ok mb-5">
          {SAVED[saved]}
        </div>
      )}
      {t.stage === "RETURNED" && (
        <div className="notice notice-wait mb-5 flex-col gap-0.5">
          <span className="font-medium">
            {t.returnedBy?.name ?? "The HOD"} sent this back{t.returnedAt && <> on {formatDateTime(t.returnedAt).split(",")[0]}</>}:
          </span>
          <span>{t.returnReason}</span>
        </div>
      )}
      {closed && t.status !== "APPROVED" && (
        <div className="notice notice-wait mb-5">
          {t.status === "SUBMITTED"
            ? `${t.year}'s TNAs are closed. This one was submitted in time and still waits for the HOD's approval; it can no longer be changed or sent back.`
            : `${t.year}'s TNAs closed before this draft was submitted, so it can only be viewed. Start ${open}'s from it to carry it forward.`}
        </div>
      )}
      {t.status === "SUBMITTED" && !t.approver && <div className="notice notice-bad mb-5">{t.department.name} has no active HOD, so no one can approve this yet.</div>}
    </>
  );
}

const SKILL = "w-px text-right whitespace-nowrap";

/** The record: at a glance, the rows under their headings, where it stands, and its history. */
export function TnaBody({
  t,
  user,
  hours,
  history,
  headcount,
}: {
  t: TnaView;
  user: SessionUser;
  /** The person's training hours in the TNA's year. Not for a job grade's TNA. */
  hours: Awaited<ReturnType<typeof tnaTrainingHours>> | null;
  history: Awaited<ReturnType<typeof tnaHistory>>;
  /** For a job grade's TNA: how many staff it covers today. */
  headcount?: number | null;
}) {
  const { staff, viewer } = t;
  const used = TNA_SECTIONS.filter((s) => t.content.some((r) => r.section === s));
  const unused = TNA_SECTIONS.filter((s) => !used.includes(s));

  return (
    <div className="flex flex-col gap-5">
      <section aria-label="At a glance" className="card p-5 sm:p-6">
        <dl className="grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
          <Fact icon={CalendarRange} label="Year">
            {t.year}
          </Fact>
          {staff ? (
            <Fact icon={UserRound} label="Filled in by">
              {t.createdBy && t.createdBy.staffNo !== staff.staffNo ? (
                <>
                  {t.createdBy.name} <span className="text-ink-3">· for {staff.name}</span>
                </>
              ) : (
                staff.name
              )}
            </Fact>
          ) : (
            <Fact icon={Users} label="Covers">
              Job grade {t.jobGrade}
              {headcount !== null && headcount !== undefined && <span className="text-ink-3"> · {plural(headcount, "staff member")} today</span>}
            </Fact>
          )}
          <Fact icon={UserCheck} label="HOD who approves">
            {t.approvedBy?.name ?? t.approver?.name ?? <span className="text-ink-3">None: no active HOD</span>}
          </Fact>
          <Fact icon={ListChecks} label="Training needs">
            {t.content.length ? (
              <>
                <span className="num font-semibold">{t.content.length}</span>{" "}
                <span className="text-ink-3">
                  · under {plural(used.length, "heading")} of {TNA_SECTIONS.length}
                </span>
              </>
            ) : (
              <span className="text-ink-3">None yet</span>
            )}
          </Fact>
        </dl>
      </section>

      <div className="grid items-start gap-5 xl:grid-cols-12">
        <div className="flex min-w-0 flex-col gap-5 xl:col-span-9">
          {used.map((section) => {
            const rows = t.content.filter((r) => r.section === section);
            return (
              <Panel key={section} title={tnaSectionTitle(section)} description={TNA_SECTION_HINTS[section] || undefined} action={<span className="text-ink-3">{plural(rows.length, "row")}</span>} flush>
                <div className="overflow-x-auto">
                  <table className="table min-w-[860px]" aria-label={tnaSectionTitle(section)}>
                    <thead>
                      <tr>
                        <th className="w-px pl-5 text-right whitespace-nowrap">No.</th>
                        <th className="min-w-[220px]">Problem statement</th>
                        <th className="min-w-[200px]">Training required</th>
                        <th className={SKILL}>Target</th>
                        <th className={SKILL}>Current</th>
                        <th className={SKILL}>Gap</th>
                        <th className="w-px whitespace-nowrap">How</th>
                        <th className="w-px pr-5 whitespace-nowrap">When</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r, i) => {
                        const gap = tnaGap(r.target, r.current);
                        return (
                          <tr key={i} className="align-top">
                            <td className="num muted pl-5 text-right">{i + 1}</td>
                            <td className="break-words whitespace-pre-line">{r.problem || <Missing />}</td>
                            <td className="break-words">
                              {r.trainingName || <Missing />}
                              {r.trainingName && r.optionId === null && <div className="muted text-xs">Others: typed in</div>}
                            </td>
                            <td className="num text-right">{r.target ?? <Missing />}</td>
                            <td className="num text-right">{r.current ?? <Missing />}</td>
                            <td className="num text-right font-semibold">{gap ?? <Missing />}</td>
                            <td className="whitespace-nowrap">{r.method ? TNA_METHOD_LABELS[r.method] : <Missing />}</td>
                            <td className="pr-5 whitespace-nowrap">{r.month ? monthLabel(r.month) : <Missing />}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Panel>
            );
          })}
          {t.content.length === 0 ? (
            <div className="card px-5 py-8 text-center text-[13px] text-ink-3">No training needs have been added yet.</div>
          ) : (
            unused.length > 0 && <p className="px-1 text-[13px] text-ink-3">Nothing under: {unused.map(tnaSectionTitle).join(", ")}.</p>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-5 xl:col-span-3">
          <Panel title="Record">
            <dl className="-my-1 flex flex-col text-[13.5px]">
              <Row label="Status">
                <Status tone={TNA_STAGE_TONE[t.stage]}>{TNA_STAGE_LABELS[t.stage]}</Status>
              </Row>
              {staff ? (
                <Row label="Staff">
                  {can(user, "staff.view") && !viewer.isOwner ? (
                    <Link href={`/staff/${staff.id}`} className="link">
                      {staff.name}
                    </Link>
                  ) : (
                    staff.name
                  )}
                  <div className="text-xs text-ink-3">
                    <span className="num">{staff.staffNo}</span> · {staff.position ?? DESIGNATION_LABELS[staff.designation]}
                    {staff.status === "RESIGNED" && " · resigned"}
                  </div>
                </Row>
              ) : (
                <Row label="Job grade">
                  <span className="num">{t.jobGrade}</span>
                </Row>
              )}
              <Row label="Department">{t.department.name}</Row>
              {t.submittedAt && t.status !== "DRAFT" && (
                <Row label="Submitted">
                  <span className="num">{formatDateTime(t.submittedAt)}</span>
                  {t.submittedBy && <div className="text-xs text-ink-3">by {t.submittedBy.name}</div>}
                </Row>
              )}
              {t.approvedAt && (
                <Row label="Approved">
                  <span className="num">{formatDateTime(t.approvedAt)}</span>
                  {t.approvedBy && <div className="text-xs text-ink-3">by {t.approvedBy.name}</div>}
                </Row>
              )}
              <Row label="Last saved">
                <span className="num">{formatDateTime(t.updatedAt)}</span>
              </Row>
            </dl>
            {/* Why the main step isn't open to this person, when it's theirs to take. */}
            {viewer.canFill && !viewer.isApprover && !viewer.isAdmin && t.status !== "DRAFT" && <p className="mt-4 rounded-lg bg-sunken px-3 py-2 text-xs text-ink-2">{t.blocked.EDIT}</p>}
            {viewer.isApprover && !viewer.canFill && t.status === "DRAFT" && <p className="mt-4 rounded-lg bg-sunken px-3 py-2 text-xs text-ink-2">{t.blocked.APPROVE}</p>}
          </Panel>

          {hours && (
            <Panel title={`Training in ${t.year}`} description="Hours from completed attendance">
              <dl className="-my-1 flex flex-col text-[13.5px]">
                <Row label="Public / In-house">
                  <span className="num">{formatHours(hours.courses)}</span>
                </Row>
                <Row label="OJT">
                  <span className="num">{formatHours(hours.ojt)}</span>
                </Row>
                <Row label="Total">
                  <span className="num font-semibold">{formatHours(hours.total)}</span>
                </Row>
              </dl>
            </Panel>
          )}

          <Panel title="Skill levels" description="Target and current skill">
            <dl className="flex flex-col gap-1.5 text-[13px]">
              {TNA_LEVELS.map((l) => (
                <div key={l.value} className="grid grid-cols-[14px_1fr] gap-3">
                  <dt className="num font-semibold">{l.value}</dt>
                  <dd>
                    {l.label}
                    <span className="block text-xs text-ink-3">{l.hint}</span>
                  </dd>
                </div>
              ))}
            </dl>
          </Panel>
        </div>
      </div>

      <HistoryPanel entries={history} fields={HISTORY_FIELDS} />
    </div>
  );
}

/** A part of a draft row that hasn't been filled in yet. */
function Missing() {
  return <span className="font-normal text-ink-3">–</span>;
}
