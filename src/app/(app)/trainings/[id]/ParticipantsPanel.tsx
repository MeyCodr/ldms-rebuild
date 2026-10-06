"use client";

import Link from "next/link";
import { ClickableRow } from "@/components/ui/ClickableRow";
import { useMemo, useRef, useState } from "react";
import { Check, Download, RotateCcw, Search, Trash2, Undo2, UserPlus, UserX } from "lucide-react";
import type { Attendance } from "@prisma/client";
import { CancelButton, Dialog } from "@/components/ui/Dialog";
import { Field, fieldProps, FormMessage, SubmitButton, useFormAction } from "@/components/ui/forms";
import { Status } from "@/components/ui/Status";
import type { ActionState } from "@/lib/action-state";
import { formatDate, plural } from "@/lib/format";
import { ATTENDANCE_LABELS, PARTICIPANT_ACTION_LABELS } from "@/lib/validation/participant";
import { PME_STAGE_LABELS, PME_STAGE_TONE, pmeStage } from "@/server/rules/pme";
import { MAX_REASON, participantActionBlock, REASON_REQUIRED, type ParticipantAction, type TrainingState } from "@/server/rules/attendance";
import type { ParticipantRow } from "@/server/services/participant";
import { AddParticipantsDialog } from "./AddParticipants";
import { participantAction } from "./participantActions";
import { withBasePath } from "@/lib/base-path";

const TONE: Record<Attendance, "ok" | "wait" | "na"> = { COMPLETED: "ok", PENDING: "wait", ABSENT: "na" };

/** Row buttons for each attendance, in the order shown. */
const ROW_ACTIONS: Record<Attendance, ParticipantAction[]> = {
  PENDING: ["MARK_COMPLETED", "MARK_ABSENT", "REMOVE"],
  ABSENT: ["UNDO_ABSENT"],
  COMPLETED: ["REOPEN"],
};
const BULK_ACTIONS: ParticipantAction[] = ["MARK_COMPLETED", "MARK_ABSENT", "REMOVE"];

/**
 * Each action's colour and icon: completed green, absent amber, remove red;
 * the corrections (undo absent, reopen) stay plain. Rows show the icon only,
 * explained by the legend above the panel; the bulk bar shows icon and words.
 */
const ACTION_STYLE: Record<ParticipantAction, { cls: string; Icon: typeof Check }> = {
  MARK_COMPLETED: { cls: "btn-ok", Icon: Check },
  MARK_ABSENT: { cls: "btn-warn", Icon: UserX },
  REMOVE: { cls: "btn-bad", Icon: Trash2 },
  UNDO_ABSENT: { cls: "", Icon: Undo2 },
  REOPEN: { cls: "", Icon: RotateCcw },
};
const LEGEND: ParticipantAction[] = ["MARK_COMPLETED", "MARK_ABSENT", "REMOVE", "UNDO_ABSENT", "REOPEN"];

function ActionIcon({ action, size = 14 }: { action: ParticipantAction; size?: number }) {
  const { Icon } = ACTION_STYLE[action];
  return <Icon size={size} aria-hidden strokeWidth={2.2} />;
}

type Filter = "ALL" | Attendance;

export function ParticipantsPanel({
  trainingId,
  rows,
  training,
  today,
  manage,
  canViewStaff,
}: {
  trainingId: number;
  rows: ParticipantRow[];
  training: TrainingState;
  /** Today in Malaysia time, from the server, so both sides agree. */
  today: string;
  manage: boolean;
  canViewStaff: boolean;
}) {
  const [filter, setFilter] = useState<Filter>("ALL");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [dialog, setDialog] = useState<{ action: ParticipantAction; ids: number[]; rows: ParticipantRow[] } | null>(null);
  const open = (action: ParticipantAction, ids: number[]) => {
    const picked = ids.map((id) => byId.get(id)).filter((r): r is ParticipantRow => !!r);
    setDialog({ action, ids, rows: picked });
  };
  const changed = useRef(false);

  const editable = manage && training.status !== "CANCELLED";
  const counts = useMemo(() => {
    const c = { ALL: rows.length, PENDING: 0, COMPLETED: 0, ABSENT: 0 };
    for (const r of rows) c[r.attendance]++;
    return c;
  }, [rows]);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter(
      (r) => (filter === "ALL" || r.attendance === filter) && (!needle || `${r.staff.name} ${r.staff.staffNo}`.toLowerCase().includes(needle)),
    );
  }, [rows, filter, q]);

  // Rows that left the list (removed elsewhere) drop out of the selection.
  const present = new Set(rows.map((r) => r.id));
  const chosen = [...selected].filter((id) => present.has(id));
  const allVisibleChecked = visible.length > 0 && visible.every((r) => selected.has(r.id));
  const toggle = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleVisible = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const r of visible) {
        if (allVisibleChecked) next.delete(r.id);
        else next.add(r.id);
      }
      return next;
    });

  const byId = new Map(rows.map((r) => [r.id, r]));
  // The PME column only when someone on the list has one (executives and managers, once completed).
  const anyPme = rows.some((r) => r.pme);
  const now = new Date(today);

  return (
    <div className="flex flex-col gap-2">
      {editable && rows.length > 0 && (
        <ul aria-label="Action buttons" className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1.5 px-1 text-xs text-ink-2">
          {LEGEND.map((a) => (
            <li key={a} className="flex items-center gap-1.5">
              <span aria-hidden className={`btn btn-icon pointer-events-none size-5 rounded ${ACTION_STYLE[a].cls}`}>
                <ActionIcon action={a} size={12} />
              </span>
              {PARTICIPANT_ACTION_LABELS[a].verb}
            </li>
          ))}
        </ul>
      )}
      <section aria-labelledby="participants-heading" className="card">
        <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-rule px-5 py-3.5">
          <h2 id="participants-heading" className="display text-[15.5px] font-semibold text-ink">
            Participants
          </h2>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {rows.length > 0 && (
              <a href={withBasePath(`/trainings/${trainingId}/participants/export`)} className="btn btn-sm" download>
                <Download size={14} aria-hidden /> Export
              </a>
            )}
            {editable && <AddParticipantsDialog trainingId={trainingId} />}
          </div>
        </header>

        {manage && training.status === "CANCELLED" && (
          <p className="border-b border-rule px-5 py-2.5 text-[13px] text-ink-2">
            The training is cancelled, so participants and attendance can&apos;t be changed. Restore it first.
          </p>
        )}

        {rows.length === 0 ? (
          <div className="flex flex-col items-center gap-1 px-5 py-10 text-center text-[13px] text-ink-2">
            <UserPlus size={20} aria-hidden className="mb-1 text-ink-3" />
            No participants yet.
            {editable && <span className="text-ink-3">Choose Add participants to pick staff by name, department or section.</span>}
          </div>
        ) : (
          <>
            {/* Counts double as filters. */}
            <div className="flex flex-wrap items-center gap-2 border-b border-rule px-5 py-2.5">
              <div role="group" aria-label="Show" className="flex flex-wrap gap-1">
                {(["ALL", "PENDING", "COMPLETED", "ABSENT"] as Filter[]).map((f) => (
                  <button
                    key={f}
                    type="button"
                    aria-pressed={filter === f}
                    onClick={() => setFilter(f)}
                    className={`btn btn-sm ${filter === f ? "border-accent bg-accent-soft text-ink" : "btn-ghost text-ink-2"}`}
                  >
                    {f === "ALL" ? "All" : <Status tone={TONE[f]}>{ATTENDANCE_LABELS[f]}</Status>}
                    <span className="num font-semibold text-ink">{counts[f]}</span>
                  </button>
                ))}
              </div>
              <label className="relative ml-auto w-full sm:w-56">
                <span className="sr-only">Search participants</span>
                <Search size={14} aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-ink-3" />
                <input
                  type="search"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Name or staff no."
                  className="input h-[28px] pl-8 text-[13px]"
                />
              </label>
            </div>

            {editable && chosen.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 border-b border-rule bg-accent-soft/60 px-5 py-2">
                <span className="text-[13px] font-medium">{chosen.length} selected</span>
                {BULK_ACTIONS.map((a) => (
                  <button key={a} type="button" className={`btn btn-sm ${ACTION_STYLE[a].cls}`} onClick={() => open(a, chosen)}>
                    <ActionIcon action={a} size={13} />
                    {PARTICIPANT_ACTION_LABELS[a].verb}
                  </button>
                ))}
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSelected(new Set())}>
                  Clear selection
                </button>
              </div>
            )}

            <div className="overflow-x-auto">
              {/* On phones the table scrolls sideways rather than squeezing names. */}
              <table className={`table ${editable ? (anyPme ? "min-w-[820px]" : "min-w-[680px]") : "min-w-[560px]"}`}>
                <thead>
                  <tr>
                    {editable && (
                      <th className="w-9 pl-5">
                        <input type="checkbox" aria-label="Select all shown" checked={allVisibleChecked} onChange={toggleVisible} className="accent-primary" />
                      </th>
                    )}
                    <th className={`w-px text-right whitespace-nowrap ${editable ? "" : "pl-5"}`}>No.</th>
                    <th className="w-24">Staff no.</th>
                    <th>Name</th>
                    <th className="hidden md:table-cell">Department</th>
                    <th>Attendance</th>
                    <th className="hidden lg:table-cell">Feedback</th>
                    {anyPme && (
                      <th className="hidden sm:table-cell" title="Performance Monitoring Evaluation, by the person's HOD">
                        PME
                      </th>
                    )}
                    {editable && (
                      <th className="pr-5 text-right">
                        <span className="sr-only">Actions</span>
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {visible.map((r, i) => (
                    <ClickableRow key={r.id} href={canViewStaff ? `/staff/${r.staff.id}` : null} className={selected.has(r.id) ? "[&>td]:bg-accent-soft" : ""}>
                      {editable && (
                        <td className="pl-5">
                          <input
                            type="checkbox"
                            aria-label={`Select ${r.staff.name}`}
                            checked={selected.has(r.id)}
                            onChange={() => toggle(r.id)}
                            className="accent-primary"
                          />
                        </td>
                      )}
                      <td className={`num muted text-right ${editable ? "" : "pl-5"}`}>{i + 1}</td>
                      <td className="num">{r.staff.staffNo}</td>
                      <td>
                        {canViewStaff ? (
                          <Link href={`/staff/${r.staff.id}`} className="link">
                            {r.staff.name}
                          </Link>
                        ) : (
                          r.staff.name
                        )}
                        {r.staff.status === "RESIGNED" && <span className="kbd-tag ml-2">Resigned</span>}
                        {r.staff.position && <div className="muted text-xs">{r.staff.position}</div>}
                      </td>
                      <td className="hidden md:table-cell">
                        {r.staff.department.name}
                        {r.staff.section && <div className="muted text-xs">{r.staff.section.name}</div>}
                      </td>
                      <td>
                        <Status tone={TONE[r.attendance]}>{ATTENDANCE_LABELS[r.attendance]}</Status>
                        {r.attendanceReason && <div className="muted max-w-[260px] text-xs break-words">{r.attendanceReason}</div>}
                      </td>
                      <td className="hidden lg:table-cell">
                        {r.submittedAt ? (
                          <span className="num whitespace-nowrap">{formatDate(r.submittedAt)}</span>
                        ) : (
                          <span className="muted">{r.attendance === "PENDING" ? "Not yet" : "None"}</span>
                        )}
                      </td>
                      {anyPme && (
                        <td className="hidden whitespace-nowrap sm:table-cell">
                          {r.pme ? (
                            <Link href={`/pme/${r.pme.id}`} className="hover:underline">
                              <Status tone={PME_STAGE_TONE[pmeStage(r.pme, now)]}>{PME_STAGE_LABELS[pmeStage(r.pme, now)]}</Status>
                            </Link>
                          ) : (
                            <span className="muted">–</span>
                          )}
                        </td>
                      )}
                      {editable && (
                        <td className="pr-5">
                          <div className="flex justify-end gap-1">
                            {ROW_ACTIONS[r.attendance].map((a) => (
                              <button
                                key={a}
                                type="button"
                                aria-label={`${PARTICIPANT_ACTION_LABELS[a].verb}: ${r.staff.name}`}
                                className={`btn btn-icon ${ACTION_STYLE[a].cls}`}
                                title={PARTICIPANT_ACTION_LABELS[a].verb}
                                onClick={() => open(a, [r.id])}
                              >
                                <ActionIcon action={a} />
                              </button>
                            ))}
                          </div>
                        </td>
                      )}
                    </ClickableRow>
                  ))}
                </tbody>
              </table>
              {visible.length === 0 && <div className="px-4 py-8 text-center text-[13px] text-ink-2">No participants match.</div>}
            </div>
          </>
        )}

        {/* One dialog for every row and bulk action; it stays open to show the result. */}
        <Dialog
          open={dialog !== null}
          onClose={() => {
            if (changed.current) setSelected(new Set());
            changed.current = false;
            setDialog(null);
          }}
          title={dialog ? dialogTitle(dialog.action, dialog.rows) : ""}
          width={480}
        >
          {dialog && (
            <ActionForm
              trainingId={trainingId}
              action={dialog.action}
              rows={dialog.rows}
              training={training}
              today={new Date(today)}
              onDone={() => {
                changed.current = true;
              }}
            />
          )}
        </Dialog>
      </section>
    </div>
  );
}

function dialogTitle(action: ParticipantAction, rows: ParticipantRow[]) {
  const verb = PARTICIPANT_ACTION_LABELS[action].verb;
  return rows.length === 1 ? `${verb}: ${rows[0].staff.name}` : `${verb}: ${rows.length} participants`;
}

const EXPLAIN: Record<ParticipantAction, string> = {
  MARK_ABSENT: "Absent attendance stays on record and doesn't count toward hours. You can undo it later.",
  UNDO_ABSENT: "They go back to pending, as if attendance hadn't been recorded yet.",
  MARK_COMPLETED: "For people who can't fill in the feedback form themselves. Their hours count from now on, and no feedback is recorded for them.",
  REOPEN: "They go back to pending and their hours stop counting until they're completed again. Any feedback they gave is kept.",
  REMOVE: "For people added by mistake. They're taken off the list; the removal stays in the history.",
};

const REASON_HINT: Partial<Record<ParticipantAction, string>> = {
  MARK_ABSENT: "Optional, e.g. on medical leave. Shown next to their attendance.",
  MARK_COMPLETED: "Shown next to their attendance, e.g. no computer access.",
  REOPEN: "Optional. Kept in the history.",
};

function ActionForm({
  trainingId,
  action,
  rows,
  training,
  today,
  onDone,
}: {
  trainingId: number;
  action: ParticipantAction;
  rows: ParticipantRow[];
  training: TrainingState;
  today: Date;
  onDone: () => void;
}) {
  const { state, onSubmit, pending } = useFormAction(async (prev: ActionState, fd: FormData) => {
    const result = await participantAction(trainingId, prev, fd);
    if (result.status === "ok") onDone();
    return result;
  });
  // Worked out once when the dialog opens: the page refreshes underneath after saving.
  const [plan] = useState(() => {
    const applying: ParticipantRow[] = [];
    const skipped: string[] = [];
    for (const r of rows) {
      const why = participantActionBlock(action, { name: r.staff.name, attendance: r.attendance, hasFeedback: r.submittedAt !== null, pme: r.pme }, training, today);
      if (why) skipped.push(why);
      else applying.push(r);
    }
    return { applying, skipped };
  });

  if (state.status === "ok")
    return (
      <div className="flex flex-col gap-4">
        <FormMessage state={state} />
        <div className="flex justify-end">
          <CancelButton label="Close" />
        </div>
      </div>
    );

  if (plan.applying.length === 0)
    return (
      <div className="flex flex-col gap-4">
        <div className="notice notice-wait">
          {plan.skipped.length === 1 ? plan.skipped[0] : `None of the selected participants can be changed this way. ${plan.skipped[0]}`}
        </div>
        <div className="flex justify-end">
          <CancelButton label="Close" />
        </div>
      </div>
    );

  const hint = REASON_HINT[action];
  const verb = PARTICIPANT_ACTION_LABELS[action].verb;
  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <input type="hidden" name="action" value={action} />
      {plan.applying.map((r) => (
        <input key={r.id} type="hidden" name="participantIds" value={r.id} />
      ))}
      <FormMessage state={state} />
      <p className="text-[13px] text-ink-2">{EXPLAIN[action]}</p>
      {plan.skipped.length > 0 && (
        <div className="notice notice-wait flex-col gap-1">
          <span className="font-medium">
            {plural(plan.applying.length, "participant")} will change; {plan.skipped.length} will be skipped:
          </span>
          <ul className="list-disc pl-4 text-xs text-ink-2">
            {plan.skipped.slice(0, 6).map((s) => (
              <li key={s}>{s}</li>
            ))}
            {plan.skipped.length > 6 && <li>and {plan.skipped.length - 6} more.</li>}
          </ul>
        </div>
      )}
      {hint && (
        <Field label="Reason" name="reason" required={REASON_REQUIRED[action]} hint={hint} state={state}>
          <input {...fieldProps("reason", state)} className="input" maxLength={MAX_REASON} autoComplete="off" autoFocus />
        </Field>
      )}
      <div className="flex justify-end gap-2 border-t border-rule pt-4">
        <CancelButton />
        <SubmitButton variant={action === "REMOVE" ? "danger" : "primary"} pending={pending}>
          {plan.applying.length === 1 ? verb : `${verb}: ${plan.applying.length}`}
        </SubmitButton>
      </div>
    </form>
  );
}
