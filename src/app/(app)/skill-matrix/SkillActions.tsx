"use client";

import { useEffect, useState } from "react";
import { Check, CheckCheck, Copy, Send, Trash2, Undo2 } from "lucide-react";
import { CancelButton, DialogButton } from "@/components/ui/Dialog";
import { Field, fieldProps, FormMessage, SubmitButton, useFormAction } from "@/components/ui/forms";
import type { ActionState } from "@/lib/action-state";
import { plural } from "@/lib/format";
import {
  approveSkillMatricesAction,
  deleteSkillMatrixAction,
  duplicateSkillMatrixAction,
  duplicateTargetsAction,
  sendBackSkillMatrixAction,
  submitSkillMatrixAction,
} from "./actions";

/** After a successful dialog action: the message and a Close button. */
function Done({ state }: { state: ActionState }) {
  return (
    <div className="flex flex-col gap-4">
      <FormMessage state={state} />
      <div className="flex justify-end">
        <CancelButton label="Close" />
      </div>
    </div>
  );
}

function Confirm({
  action,
  children,
  submitLabel,
  pendingLabel,
  variant = "primary",
}: {
  action: (prev: ActionState) => Promise<ActionState>;
  children: React.ReactNode;
  submitLabel: string;
  pendingLabel: string;
  variant?: "primary" | "danger";
}) {
  const { state, onSubmit, pending } = useFormAction(action);
  if (state.status === "ok") return <Done state={state} />;
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <FormMessage state={state} />
      <div className="text-[13px] text-ink-2">{children}</div>
      <div className="flex justify-end gap-2 border-t border-rule pt-4">
        <CancelButton />
        <SubmitButton variant={variant} pending={pending} pendingLabel={pendingLabel}>
          {submitLabel}
        </SubmitButton>
      </div>
    </form>
  );
}

// The dialogs stay mounted after the status changes, so the result is still shown; only their buttons hide.

/** The evaluator sends a draft to the HOD from its page. */
export function SubmitSkillDialog({ id, staffName, hodName, hidden }: { id: number; staffName: string; hodName: string | null; hidden: boolean }) {
  return (
    <DialogButton
      hideTrigger={hidden}
      variant="primary"
      label={
        <>
          <Send size={14} aria-hidden /> Submit to HOD
        </>
      }
      title={`Submit ${staffName}'s matrix`}
    >
      <Confirm action={submitSkillMatrixAction.bind(null, id)} submitLabel="Submit" pendingLabel="Sending…">
        {hodName ?? "The HOD"} approves it or sends it back. Once sent, it can be changed only if they send it back.
      </Confirm>
    </DialogButton>
  );
}

export function DeleteSkillDialog({ id, staffName, hidden }: { id: number; staffName: string; hidden: boolean }) {
  return (
    <DialogButton
      hideTrigger={hidden}
      variant="danger"
      label={
        <>
          <Trash2 size={14} aria-hidden /> Delete
        </>
      }
      title={`Delete ${staffName}'s draft`}
    >
      <Confirm action={deleteSkillMatrixAction.bind(null, id)} submitLabel="Delete" pendingLabel="Deleting…" variant="danger">
        The draft and everything typed into it are removed. {staffName} then has no matrix for this quarter until one is started again.
      </Confirm>
    </DialogButton>
  );
}

/** The HOD approves one matrix (from its page or a row) or several (Approve all). */
export function ApproveSkillDialog({
  ids,
  title,
  label,
  size,
  hidden = false,
  closedNote,
}: {
  ids: number[];
  title: string;
  label?: React.ReactNode;
  size?: "sm";
  hidden?: boolean;
  /** Said when some are from a quarter that has closed. */
  closedNote?: string;
}) {
  const many = ids.length > 1;
  return (
    <DialogButton
      hideTrigger={hidden}
      variant="primary"
      size={size}
      label={
        label ?? (
          <>
            {many ? <CheckCheck size={15} aria-hidden /> : <Check size={15} aria-hidden />} {many ? `Approve all ${ids.length}` : "Approve"}
          </>
        )
      }
      title={title}
    >
      <Confirm action={approveSkillMatricesAction.bind(null, ids)} submitLabel={many ? `Approve ${ids.length}` : "Approve"} pendingLabel="Approving…">
        {many ? `${plural(ids.length, "matrix", "matrices")} will be approved and locked.` : "Approving locks this matrix."} An approved matrix can&apos;t be
        changed or sent back; the next one is filled in next quarter.{closedNote && <> {closedNote}</>}
      </Confirm>
    </DialogButton>
  );
}

export function SendBackSkillDialog({
  id,
  staffName,
  evaluatorName,
  hidden,
}: {
  id: number;
  staffName: string;
  evaluatorName: string | null;
  hidden: boolean;
}) {
  return (
    <DialogButton
      hideTrigger={hidden}
      label={
        <>
          <Undo2 size={14} aria-hidden /> Send back
        </>
      }
      title={`Send ${staffName}'s matrix back`}
    >
      <SendBackForm id={id} evaluatorName={evaluatorName} />
    </DialogButton>
  );
}

function SendBackForm({ id, evaluatorName }: { id: number; evaluatorName: string | null }) {
  const { state, onSubmit, pending } = useFormAction(sendBackSkillMatrixAction.bind(null, id));
  if (state.status === "ok") return <Done state={state} />;
  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <FormMessage state={state} />
      <p className="text-[13px] text-ink-2">{evaluatorName ?? "The evaluator"} can change the matrix and submit it again.</p>
      <Field label="Reason" name="reason" required hint="Shown to the evaluator above the form." state={state}>
        <input {...fieldProps("reason", state)} className="input" maxLength={255} autoComplete="off" autoFocus />
      </Field>
      <div className="flex justify-end gap-2 border-t border-rule pt-4">
        <CancelButton />
        <SubmitButton pending={pending} pendingLabel="Sending…">
          Send back
        </SubmitButton>
      </div>
    </form>
  );
}

type Targets = NonNullable<Awaited<ReturnType<typeof duplicateTargetsAction>>>;

/** Copies a matrix to other staff in the department (or to the same person, from an earlier quarter), as drafts in the open quarter. */
export function DuplicateSkillDialog({ id, staffName, quarter, size }: { id: number; staffName: string; quarter: string; size?: "sm" }) {
  return (
    <DialogButton
      size={size}
      label={
        <>
          <Copy size={14} aria-hidden /> Duplicate
        </>
      }
      title={`Duplicate ${staffName}'s ${quarter} matrix`}
      description="Its topics, lines and ratings are copied as a draft for each person you choose, as a starting point. Adjust each one before sending it to the HOD."
      width={560}
    >
      <DuplicateForm id={id} />
    </DialogButton>
  );
}

function DuplicateForm({ id }: { id: number }) {
  const [data, setData] = useState<Targets | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [q, setQ] = useState("");
  const { state, onSubmit, pending } = useFormAction(duplicateSkillMatrixAction.bind(null, id));

  useEffect(() => {
    let live = true;
    duplicateTargetsAction(id)
      .then((d) => live && (d ? setData(d) : setLoadError(true)))
      .catch(() => live && setLoadError(true));
    return () => {
      live = false;
    };
  }, [id]);

  if (state.status === "ok") return <Done state={state} />;
  if (loadError) return <div className="notice notice-bad">The staff list couldn&apos;t be loaded. Close this and try again.</div>;
  if (!data) return <p className="py-6 text-center text-[13px] text-ink-3">Loading staff…</p>;

  const openLabel = `Q${data.open.quarter} ${data.open.year}`;
  if (data.targets.length === 0)
    return (
      <div className="flex flex-col gap-4">
        <div className="notice notice-wait">
          Everyone you fill in matrices for in this department already has one for {openLabel}, so there is no one to copy it to.
        </div>
        <div className="flex justify-end">
          <CancelButton label="Close" />
        </div>
      </div>
    );

  const needle = q.trim().toLowerCase();
  const shown = data.targets.filter((s) => !needle || `${s.name} ${s.staffNo}`.toLowerCase().includes(needle));
  const allShown = shown.length > 0 && shown.every((s) => selected.has(s.id));
  const toggle = (staffId: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(staffId)) next.delete(staffId);
      else next.add(staffId);
      return next;
    });

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      {[...selected].map((staffId) => (
        <input key={staffId} type="hidden" name="staffIds" value={staffId} />
      ))}
      <FormMessage state={state} />
      <p className="text-[13px] text-ink-2">
        Staff without a matrix for <span className="font-medium text-ink">{openLabel}</span> yet:
      </p>
      <div className="flex items-center gap-2">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name or staff no."
          className="input"
          aria-label="Search staff"
        />
        <button
          type="button"
          className="btn btn-sm shrink-0"
          onClick={() =>
            setSelected((prev) => {
              const next = new Set(prev);
              for (const s of shown) {
                if (allShown) next.delete(s.id);
                else next.add(s.id);
              }
              return next;
            })
          }
        >
          {allShown ? "Clear shown" : "Select all shown"}
        </button>
      </div>
      <ul aria-label="Staff" className="max-h-72 overflow-y-auto rounded-lg border border-rule">
        {shown.map((s) => (
          <li key={s.id} className="border-b border-rule last:border-b-0">
            <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-[13.5px] hover:bg-sunken">
              <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s.id)} className="accent-primary" />
              <span className="min-w-0 flex-1">
                {s.name}
                {s.position && <span className="text-ink-3"> · {s.position}</span>}
              </span>
              <span className="num text-xs text-ink-3">{s.staffNo}</span>
            </label>
          </li>
        ))}
        {shown.length === 0 && <li className="px-3 py-6 text-center text-[13px] text-ink-3">No one matches.</li>}
      </ul>
      <div className="flex items-center justify-between gap-2 border-t border-rule pt-4">
        <span className="text-[13px] text-ink-2">{selected.size} selected</span>
        <div className="flex gap-2">
          <CancelButton />
          <SubmitButton pending={pending} pendingLabel="Copying…" disabled={selected.size === 0}>
            {selected.size ? `Duplicate to ${selected.size}` : "Duplicate"}
          </SubmitButton>
        </div>
      </div>
    </form>
  );
}
