"use client";

import { Ban, RotateCcw, Trash2 } from "lucide-react";
import { CancelButton, DialogButton } from "@/components/ui/Dialog";
import { FormMessage, SubmitButton, useFormAction } from "@/components/ui/forms";
import type { ActionState } from "@/lib/action-state";
import { cancelTrainingAction, deleteTrainingAction, restoreTrainingAction } from "../actions";

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

// Cancel and Restore both stay mounted so a dialog's result is still shown after the status flips.

export function CancelTrainingDialog({ id, title, participantCount, hidden }: { id: number; title: string; participantCount: number; hidden: boolean }) {
  return (
    <DialogButton hideTrigger={hidden} label={
        <>
          <Ban size={14} aria-hidden /> Cancel training
        </>
      }
      title={`Cancel ${title}`}>
      <Confirm action={cancelTrainingAction.bind(null, id)} submitLabel="Cancel training" pendingLabel="Cancelling…" variant="danger">
        The training and its participant list are kept for the record, but its hours stop counting toward anyone&apos;s total.
        {participantCount > 0 && " Participants are not notified."} You can restore it later if this was a mistake.
      </Confirm>
    </DialogButton>
  );
}

export function RestoreTrainingDialog({ id, title, hidden }: { id: number; title: string; hidden: boolean }) {
  return (
    <DialogButton hideTrigger={hidden} label={
        <>
          <RotateCcw size={14} aria-hidden /> Restore
        </>
      }
      title={`Restore ${title}`}>
      <Confirm action={restoreTrainingAction.bind(null, id)} submitLabel="Restore" pendingLabel="Restoring…">
        The training goes back on the schedule, and completed attendance counts toward hours again.
      </Confirm>
    </DialogButton>
  );
}

export function DeleteTrainingDialog({ id, title, blocked }: { id: number; title: string; blocked: string | null }) {
  return (
    <DialogButton
      label={
        <>
          <Trash2 size={14} aria-hidden /> Delete
        </>
      }
      variant="danger"
      title={`Delete ${title}`}
    >
      {blocked ? (
        <div className="flex flex-col gap-4">
          <div className="notice notice-wait">{blocked}</div>
          <div className="flex justify-end">
            <CancelButton label="Close" />
          </div>
        </div>
      ) : (
        <Confirm action={deleteTrainingAction.bind(null, id)} submitLabel="Delete training" pendingLabel="Deleting…" variant="danger">
          This removes the training and its sessions for good. It has no participants, so no one&apos;s history changes. The deletion
          stays in the audit log.
        </Confirm>
      )}
    </DialogButton>
  );
}
