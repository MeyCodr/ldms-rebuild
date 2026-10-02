"use client";

import { Trash2 } from "lucide-react";
import { CancelButton, DialogButton } from "@/components/ui/Dialog";
import { FormMessage, SubmitButton, useFormAction } from "@/components/ui/forms";
import { deleteOjtAction } from "./actions";

/** Deletes an OJT the person recorded. When it can't be deleted, the dialog says why instead. */
export function DeleteOjtDialog({ participantId, title, blocked }: { participantId: number; title: string; blocked: string | null }) {
  return (
    <DialogButton
      variant="danger"
      label={
        <>
          <Trash2 size={14} aria-hidden /> Delete
        </>
      }
      title={`Delete ${title}`}
    >
      {blocked ? (
        <div className="flex flex-col gap-4">
          <p className="notice notice-wait">{blocked}</p>
          <div className="flex justify-end">
            <CancelButton label="Close" />
          </div>
        </div>
      ) : (
        <Confirm participantId={participantId} />
      )}
    </DialogButton>
  );
}

function Confirm({ participantId }: { participantId: number }) {
  const { state, onSubmit, pending } = useFormAction(deleteOjtAction.bind(null, participantId));
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <FormMessage state={state} />
      <p className="text-[13px] text-ink-2">The OJT and its hours are taken off your record. This can&apos;t be undone; the deletion stays in the audit log.</p>
      <div className="flex justify-end gap-2 border-t border-rule pt-4">
        <CancelButton />
        <SubmitButton variant="danger" pending={pending} pendingLabel="Deleting…">
          Delete OJT
        </SubmitButton>
      </div>
    </form>
  );
}
