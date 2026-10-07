import type { Metadata } from "next";
import Link from "next/link";
import { forbidden, notFound } from "next/navigation";
import { CalendarRange, Gauge, Pencil, UserCheck, UserRound } from "lucide-react";
import { HistoryPanel, type HistoryFields } from "@/components/HistoryPanel";
import { PageHeader } from "@/components/PageHeader";
import { Panel } from "@/components/Panel";
import { Fact, Row } from "@/components/RecordParts";
import { Status } from "@/components/ui/Status";
import { SKILL_SECTION_LABELS, SKILL_SECTIONS, skillRatingLabel } from "@/lib/forms/skill";
import { formatDate, formatDateTime, nowInMalaysia, plural } from "@/lib/format";
import { DESIGNATION_LABELS } from "@/lib/validation/staff";
import { can } from "@/server/permissions";
import {
  fillsInSkillMatrices,
  quarterLabel,
  quarterMonths,
  quarterParam,
  seesSkillMatrices,
  SKILL_LEVELS,
  SKILL_STAGE_LABELS,
  SKILL_STAGE_TONE,
  skillLevel,
  skillOpenQuarter,
  skillQuarterBlock,
  skillQuarterCloses,
} from "@/server/rules/skill";
import { getSkillMatrix, skillHistory } from "@/server/services/skill";
import { requireUser } from "@/server/session";
import { ApproveSkillDialog, DeleteSkillDialog, DuplicateSkillDialog, SendBackSkillDialog, SubmitSkillDialog } from "../SkillActions";

export const metadata: Metadata = { title: "Skill matrix" };

const SAVED: Record<string, string> = {
  draft: "Draft saved. Submit it to the HOD when it's complete.",
  submitted: "Submitted. The HOD can now approve it or send it back.",
};

const HISTORY_FIELDS: HistoryFields = {
  status: { label: "Status", format: (v) => ({ DRAFT: "Draft", SUBMITTED: "Waiting for HOD", APPROVED: "Approved" })[String(v)] ?? String(v) },
  topics: { label: "Topics" },
  reason: { label: "Reason", listing: true },
};

const levelLabel = (score: number) => SKILL_LEVELS.find((l) => l.level === skillLevel(score))!.label;

export default async function SkillMatrixRecordPage({ params, searchParams }: PageProps<"/skill-matrix/[id]">) {
  const user = await requireUser();
  if (!seesSkillMatrices(user)) forbidden();
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const today = nowInMalaysia();
  const m = await getSkillMatrix(user, id, today);
  if (!m) notFound();
  const history = can(user, "audit.view") ? await skillHistory(id) : [];

  const { saved } = await searchParams;
  const { staff, viewer } = m;
  const open = skillOpenQuarter(today);
  const closed = skillQuarterBlock(m, today);
  const scores = m.topics.map((t) => t.score).filter((s): s is number => s !== null);
  const average = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
  const back = `/skill-matrix${closed ? `?quarter=${quarterParam(m)}` : ""}`;

  return (
    <div>
      <PageHeader
        module="skills"
        context={{ href: back, label: "Skill matrix" }}
        title={staff.name}
        meta={
          <>
            <span className="num">{staff.staffNo}</span>
            <span>{staff.department.name}</span>
            <span className="font-semibold text-ink">{quarterLabel(m)}</span>
            <Status tone={SKILL_STAGE_TONE[m.stage]}>{SKILL_STAGE_LABELS[m.stage]}</Status>
          </>
        }
        actions={
          <>
            {m.blocked.EDIT === null && (
              <Link href={`/skill-matrix/${m.id}/edit`} className="btn">
                <Pencil size={14} aria-hidden /> Edit
              </Link>
            )}
            {/* Anyone who fills in matrices can copy this one into the open quarter, even from a closed quarter. */}
            {fillsInSkillMatrices(user) && m.topics.length > 0 && <DuplicateSkillDialog id={m.id} staffName={staff.name} quarter={quarterLabel(m)} />}
            {viewer.canEvaluate && (
              <>
                <SubmitSkillDialog id={m.id} staffName={staff.name} hodName={m.approver?.name ?? null} hidden={m.blocked.SUBMIT !== null} />
                <span aria-hidden className={`mx-1 hidden h-5 w-px bg-rule ${m.blocked.DELETE === null ? "sm:block" : ""}`} />
                <DeleteSkillDialog id={m.id} staffName={staff.name} hidden={m.blocked.DELETE !== null} />
              </>
            )}
            {viewer.isApprover && (
              <>
                <SendBackSkillDialog id={m.id} staffName={staff.name} evaluatorName={m.createdBy?.name ?? null} hidden={m.blocked.SEND_BACK !== null} />
                <ApproveSkillDialog ids={[m.id]} title={`Approve ${staff.name}'s matrix`} hidden={m.blocked.APPROVE !== null} />
              </>
            )}
          </>
        }
      />

      {typeof saved === "string" && SAVED[saved] && (
        <div role="status" className="notice notice-ok mb-5">
          {SAVED[saved]}
        </div>
      )}
      {m.stage === "RETURNED" && (
        <div className="notice notice-wait mb-5 flex-col gap-0.5">
          <span className="font-medium">The HOD sent this back{m.returnedAt && <> on {formatDateTime(m.returnedAt).split(",")[0]}</>}:</span>
          <span>{m.returnReason}</span>
        </div>
      )}
      {/* A closed quarter: say so, and what can still be done with this matrix. */}
      {closed && m.status !== "APPROVED" && (
        <div className="notice notice-wait mb-5">
          {m.status === "SUBMITTED"
            ? `${quarterLabel(m)} closed on ${formatDate(skillQuarterCloses(m))}. This matrix was submitted in time and still waits for the HOD's approval; it can no longer be changed or sent back.`
            : `${quarterLabel(m)} closed on ${formatDate(skillQuarterCloses(m))} before this draft was submitted, so it can only be viewed. Duplicate it to carry it into ${quarterLabel(open)}.`}
        </div>
      )}
      {m.status === "SUBMITTED" && !m.approver && (
        <div className="notice notice-bad mb-5">{staff.department.name} has no active HOD, so no one can approve this yet.</div>
      )}

      <div className="flex flex-col gap-5">
        <section aria-label="At a glance" className="card p-5 sm:p-6">
          <dl className="grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
            <Fact icon={CalendarRange} label="Quarter">
              {quarterLabel(m)} <span className="text-ink-3">· {quarterMonths(m)}</span>
            </Fact>
            <Fact icon={UserRound} label="Evaluator">
              {m.createdBy?.name ?? <span className="text-ink-3">Not recorded</span>}
            </Fact>
            <Fact icon={UserCheck} label="HOD who approves">
              {m.approvedBy?.name ?? m.approver?.name ?? <span className="text-ink-3">None: no active HOD</span>}
            </Fact>
            <Fact icon={Gauge} label="Average score">
              {average !== null ? (
                <>
                  <span className="num font-semibold">{average}%</span> <span className="text-ink-3">· {plural(m.topics.length, "topic")}</span>
                </>
              ) : (
                <span className="text-ink-3">Nothing rated yet</span>
              )}
            </Fact>
          </dl>
        </section>

        <div className="grid items-start gap-5 lg:grid-cols-12">
          <div className="flex min-w-0 flex-col gap-5 lg:col-span-8">
            {SKILL_SECTIONS.map((section) => {
              const topics = m.topics.filter((t) => t.section === section);
              return (
                <Panel key={section} title={SKILL_SECTION_LABELS[section]} action={<span className="text-ink-3">{plural(topics.length, "topic")}</span>} flush>
                  {topics.length === 0 ? (
                    <p className="px-5 py-4 text-[13px] text-ink-3">No topics in this section yet.</p>
                  ) : (
                    <ol>
                      {topics.map((t) => (
                        <li key={t.id} className="border-b border-rule px-5 py-3.5 last:border-b-0">
                          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
                            <h3 className="text-[13.5px] font-medium break-words">{t.name || <span className="text-ink-3">Unnamed topic</span>}</h3>
                            {t.score !== null && (
                              <span className="text-[13px] whitespace-nowrap">
                                <span className="num font-semibold">{t.score}%</span> <span className="text-ink-3">· {levelLabel(t.score)}</span>
                              </span>
                            )}
                          </div>
                          {t.items.length > 0 && (
                            <ul className="mt-1.5 flex flex-col gap-1 text-[13px]">
                              {t.items.map((line, i) => (
                                <li key={i} className="grid grid-cols-[1fr_auto] gap-x-4">
                                  <span className="text-ink-2 break-words">{line.text}</span>
                                  {line.rating !== null ? (
                                    <span className="whitespace-nowrap">
                                      <span className="num font-semibold">{line.rating}</span>{" "}
                                      <span className="text-ink-3">{skillRatingLabel(line.rating)}</span>
                                    </span>
                                  ) : (
                                    <span className="text-ink-3">Not rated</span>
                                  )}
                                </li>
                              ))}
                            </ul>
                          )}
                        </li>
                      ))}
                    </ol>
                  )}
                </Panel>
              );
            })}
          </div>

          <div className="flex min-w-0 flex-col gap-5 lg:col-span-4">
            <Panel title="Record">
              <dl className="-my-1 flex flex-col text-[13.5px]">
                <Row label="Status">
                  <Status tone={SKILL_STAGE_TONE[m.stage]}>{SKILL_STAGE_LABELS[m.stage]}</Status>
                </Row>
                <Row label="Staff">
                  {can(user, "staff.view") ? (
                    <Link href={`/staff/${staff.id}`} className="link">
                      {staff.name}
                    </Link>
                  ) : (
                    staff.name
                  )}
                  <div className="text-xs text-ink-3">
                    {staff.position ?? DESIGNATION_LABELS[staff.designation]}
                    {staff.status === "RESIGNED" && " · resigned"}
                  </div>
                </Row>
                {m.submittedAt && m.status !== "DRAFT" && (
                  <Row label="Submitted">
                    <span className="num">{formatDateTime(m.submittedAt)}</span>
                    {m.createdBy && <div className="text-xs text-ink-3">by {m.createdBy.name}</div>}
                  </Row>
                )}
                {m.approvedAt && (
                  <Row label="Approved">
                    <span className="num">{formatDateTime(m.approvedAt)}</span>
                    {m.approvedBy && <div className="text-xs text-ink-3">by {m.approvedBy.name}</div>}
                  </Row>
                )}
                {m.copiedFrom && (
                  <Row label="Copied from">
                    <Link href={`/skill-matrix/${m.copiedFrom.id}`} className="link">
                      {m.copiedFrom.staff.name}, {quarterLabel(m.copiedFrom)}
                    </Link>
                  </Row>
                )}
                <Row label="Last saved">
                  <span className="num">{formatDateTime(m.updatedAt)}</span>
                </Row>
              </dl>
              {/* Why the main step isn't open to this person, when it's theirs to take. */}
              {viewer.canEvaluate && m.status === "SUBMITTED" && <p className="mt-4 rounded-lg bg-sunken px-3 py-2 text-xs text-ink-2">{m.blocked.EDIT}</p>}
              {viewer.isApprover && m.status === "DRAFT" && <p className="mt-4 rounded-lg bg-sunken px-3 py-2 text-xs text-ink-2">{m.blocked.APPROVE}</p>}
            </Panel>

            <Panel title="Levels" description="What a topic's score means">
              <dl className="flex flex-col gap-1.5 text-[13px]">
                {SKILL_LEVELS.map((l, i) => (
                  <div key={l.level} className="grid grid-cols-[70px_1fr] gap-3">
                    <dt className="num text-ink-3">{i === 0 ? "100%" : l.level === 0 ? "Below 25%" : `${l.level}% +`}</dt>
                    <dd>
                      {l.label}
                      {l.hint && <span className="text-ink-3"> · {l.hint}</span>}
                    </dd>
                  </div>
                ))}
              </dl>
            </Panel>
          </div>
        </div>

        <HistoryPanel entries={history} fields={HISTORY_FIELDS} />
      </div>
    </div>
  );
}
