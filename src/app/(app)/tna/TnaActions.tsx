"use client";

import { useId } from "react";
import { Check, CheckCheck, RotateCcw, Send, Trash2, Undo2 } from "lucide-react";
import { CancelButton, DialogButton } from "@/components/ui/Dialog";
import { Field, fieldProps, FormMessage, SubmitButton, useFormAction } from "@/components/ui/forms";
import type { ActionState } from "@/lib/action-state";
import { plural } from "@/lib/format";
import { approveTnasAction, deleteTnaAction, reopenTnaAction, sendBackTnaAction, submitTnaAction } from "./actions";

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

/** A dialog that asks for a reason: sending back (the HOD) and reopening (L&D). */
function ReasonForm({
  action,
  children,
  hint,
  submitLabel,
}: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  children: React.ReactNode;
  hint: string;
  submitLabel: string;
}) {
  const { state, onSubmit, pending } = useFormAction(action);
  // A page can hold two of these (send back for a HOD, reopen for L&D), so the field's id is this form's own.
  const id = useId();
  if (state.status === "ok") return <Done state={state} />;
  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <FormMessage state={state} />
      <p className="text-[13px] text-ink-2">{children}</p>
      <Field label="Reason" name="reason" id={id} required hint={hint} state={state}>
        <input {...fieldProps("reason", state, id)} className="input" maxLength={255} autoComplete="off" autoFocus />
      </Field>
      <div className="flex justify-end gap-2 border-t border-rule pt-4">
        <CancelButton />
        <SubmitButton pending={pending} pendingLabel="Saving…">
          {submitLabel}
        </SubmitButton>
      </div>
    </form>
  );
}

// The dialogs stay mounted after the status changes, so the result is still shown; only their buttons hide.

/** Whoever fills the TNA in sends the draft to the HOD from its page. */
export function SubmitTnaDialog({ id, title, hodName, hidden }: { id: number; title: string; hodName: string | null; hidden: boolean }) {
  return (
    <DialogButton
      hideTrigger={hidden}
      variant="primary"
      label={
        <>
          <Send size={14} aria-hidden /> Submit to HOD
        </>
      }
      title={`Submit ${title}`}
    >
      <Confirm action={submitTnaAction.bind(null, id)} submitLabel="Submit" pendingLabel="Sending…">
        {hodName ?? "The HOD"} can change it, approve it or send it back. Once sent, you can change it only if they send it back.
      </Confirm>
    </DialogButton>
  );
}

export function DeleteTnaDialog({ id, title, hidden }: { id: number; title: string; hidden: boolean }) {
  return (
    <DialogButton
      hideTrigger={hidden}
      variant="danger"
      label={
        <>
          <Trash2 size={14} aria-hidden /> Delete
        </>
      }
      title={`Delete the draft of ${title}`}
    >
      <Confirm action={deleteTnaAction.bind(null, id)} submitLabel="Delete" pendingLabel="Deleting…" variant="danger">
        The draft and every row in it are removed. It can be started again afterwards.
      </Confirm>
    </DialogButton>
  );
}

/** The HOD approves one TNA (from its page) or several (Approve all). */
export function ApproveTnaDialog({ ids, title, size, hidden = false, note }: { ids: number[]; title: string; size?: "sm"; hidden?: boolean; note?: string }) {
  const many = ids.length > 1;
  return (
    <DialogButton
      hideTrigger={hidden}
      variant="primary"
      size={size}
      label={
        <>
          {many ? <CheckCheck size={15} aria-hidden /> : <Check size={15} aria-hidden />} {many ? `Approve all ${ids.length}` : "Approve"}
        </>
      }
      title={title}
    >
      <Confirm action={approveTnasAction.bind(null, ids)} submitLabel={many ? `Approve ${ids.length}` : "Approve"} pendingLabel="Approving…">
        {many ? `${plural(ids.length, "TNA")} will be approved and locked.` : "Approving locks this TNA."} After that, only L&amp;D can reopen it.{note && <> {note}</>}
      </Confirm>
    </DialogButton>
  );
}

export function SendBackTnaDialog({ id, title, hidden }: { id: number; title: string; hidden: boolean }) {
  return (
    <DialogButton
      hideTrigger={hidden}
      label={
        <>
          <Undo2 size={14} aria-hidden /> Send back
        </>
      }
      title={`Send ${title} back`}
    >
      <ReasonForm action={sendBackTnaAction.bind(null, id)} hint="Shown above the form to whoever fills it in." submitLabel="Send back">
        Whoever filled it in can change it and submit it again. To change it yourself, use Edit instead.
      </ReasonForm>
    </DialogButton>
  );
}

/** L&D reopen an approved TNA. */
export function ReopenTnaDialog({ id, title, hidden }: { id: number; title: string; hidden: boolean }) {
  return (
    <DialogButton
      hideTrigger={hidden}
      label={
        <>
          <RotateCcw size={14} aria-hidden /> Reopen
        </>
      }
      title={`Reopen ${title}`}
    >
      <ReasonForm action={reopenTnaAction.bind(null, id)} hint="Kept in the audit log, and shown above the form." submitLabel="Reopen">
        The approval is removed. The TNA goes back to whoever fills it in, to be changed, submitted and approved again.
      </ReasonForm>
    </DialogButton>
  );
}
