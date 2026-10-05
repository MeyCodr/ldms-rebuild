"use client";

import { Trash2 } from "lucide-react";
import { CancelButton, DialogButton } from "@/components/ui/Dialog";
import { FormMessage, SubmitButton, useFormAction } from "@/components/ui/forms";
import { plural } from "@/lib/format";
import { deleteOjtEntryAction } from "../actions";

/** Deletes the OJT a record belongs to, for everyone on it. */
export function DeleteOjtEntryDialog({ participantId, title, people }: { participantId: number; title: string; people: number }) {
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
      <Confirm participantId={participantId} people={people} />
    </DialogButton>
  );
}

function Confirm({ participantId, people }: { participantId: number; people: number }) {
  const { state, onSubmit, pending } = useFormAction(deleteOjtEntryAction.bind(null, participantId));
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <FormMessage state={state} />
      <p className="text-[13px] text-ink-2">
        {people > 1
          ? `The OJT and its hours are taken off the records of all ${plural(people, "staff member")} on it. To take off only some of them, use Edit instead.`
          : "The OJT and its hours are taken off the staff member's record."}{" "}
        This can&apos;t be undone; the deletion stays in the audit log.
      </p>
      <div className="flex justify-end gap-2 border-t border-rule pt-4">
        <CancelButton />
        <SubmitButton variant="danger" pending={pending} pendingLabel="Deleting…">
          Delete OJT
        </SubmitButton>
      </div>
    </form>
  );
}
