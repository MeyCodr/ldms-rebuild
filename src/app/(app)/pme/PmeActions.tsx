"use client";

import { Check, Undo2 } from "lucide-react";
import { CancelButton, DialogButton } from "@/components/ui/Dialog";
import { Field, fieldProps, FormMessage, SubmitButton, useFormAction } from "@/components/ui/forms";
import type { ActionState } from "@/lib/action-state";
import { MAX_PME_COMMENT, MAX_PME_REASON } from "@/lib/validation/pme";
import { acknowledgePmeAction, sendBackPmeAction, verifyPmeAction } from "./actions";

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

/** The staff member's step: one button, with room for a comment. */
export function AcknowledgeForm({ pmeId }: { pmeId: number }) {
  const { state, onSubmit, pending } = useFormAction(acknowledgePmeAction.bind(null, pmeId));
  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <FormMessage state={state} />
      <Field label="Comment" name="comment" hint="Optional. Your HOD and the L&D unit can read it." state={state}>
        <textarea {...fieldProps("comment", state)} className="textarea" rows={3} maxLength={MAX_PME_COMMENT} />
      </Field>
      <div>
        <SubmitButton pending={pending} pendingLabel="Sending…">
          <Check size={15} aria-hidden /> Acknowledge
        </SubmitButton>
      </div>
    </form>
  );
}

// Both dialogs stay mounted after the status changes, so the result is still shown; only their buttons hide.

export function VerifyPmeDialog({ pmeId, staffName, average, hidden }: { pmeId: number; staffName: string; average: number | null; hidden: boolean }) {
  return (
    <DialogButton
      hideTrigger={hidden}
      variant="primary"
      label={
        <>
          <Check size={15} aria-hidden /> Verify
        </>
      }
      title={`Verify ${staffName}'s PME`}
    >
      <VerifyForm pmeId={pmeId} average={average} />
    </DialogButton>
  );
}

function VerifyForm({ pmeId, average }: { pmeId: number; average: number | null }) {
  const { state, onSubmit, pending } = useFormAction(verifyPmeAction.bind(null, pmeId));
  if (state.status === "ok") return <Done state={state} />;
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <FormMessage state={state} />
      <p className="text-[13px] text-ink-2">
        Verifying saves the mark
        {average !== null && (
          <>
            {" "}
            of <span className="num font-semibold text-ink">{average}</span> out of 100
          </>
        )}{" "}
        and locks this PME. It can&apos;t be changed or sent back afterwards.
      </p>
      <div className="flex justify-end gap-2 border-t border-rule pt-4">
        <CancelButton />
        <SubmitButton pending={pending} pendingLabel="Verifying…">
          Verify
        </SubmitButton>
      </div>
    </form>
  );
}

export function SendBackPmeDialog({ pmeId, staffName, hodName, hidden }: { pmeId: number; staffName: string; hodName: string | null; hidden: boolean }) {
  return (
    <DialogButton
      hideTrigger={hidden}
      label={
        <>
          <Undo2 size={14} aria-hidden /> Send back to HOD
        </>
      }
      title={`Send ${staffName}'s PME back`}
    >
      <SendBackForm pmeId={pmeId} hodName={hodName} />
    </DialogButton>
  );
}

function SendBackForm({ pmeId, hodName }: { pmeId: number; hodName: string | null }) {
  const { state, onSubmit, pending } = useFormAction(sendBackPmeAction.bind(null, pmeId));
  if (state.status === "ok") return <Done state={state} />;
  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <FormMessage state={state} />
      <p className="text-[13px] text-ink-2">
        {hodName ?? "The HOD"} evaluates again, starting from what they wrote. The staff member then acknowledges the new evaluation; any comment they gave on
        this one is removed.
      </p>
      <Field label="Reason" name="reason" required hint="Shown to the HOD above the form." state={state}>
        <input {...fieldProps("reason", state)} className="input" maxLength={MAX_PME_REASON} autoComplete="off" autoFocus />
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
