"use client";

import { useEffect, useMemo, useState } from "react";
import { UserPlus } from "lucide-react";
import { CancelButton, DialogButton } from "@/components/ui/Dialog";
import { FormMessage, SubmitButton, useFormAction } from "@/components/ui/forms";
import { StaffPicker } from "@/components/StaffPicker";
import { plural } from "@/lib/format";
import { addParticipantsAction, participantCandidatesAction } from "./participantActions";

type Candidates = Awaited<ReturnType<typeof participantCandidatesAction>>;

export function AddParticipantsDialog({ trainingId }: { trainingId: number }) {
  return (
    <DialogButton
      label={
        <>
          <UserPlus size={14} aria-hidden /> Add participants
        </>
      }
      variant="primary"
      size="sm"
      title="Add participants"
      description="Pick staff by name, or narrow to a department or section and select everyone in it. Resigned staff aren't listed."
      width={640}
    >
      <AddForm trainingId={trainingId} />
    </DialogButton>
  );
}

function AddForm({ trainingId }: { trainingId: number }) {
  const [data, setData] = useState<Candidates | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const { state, onSubmit, pending } = useFormAction(addParticipantsAction.bind(null, trainingId));

  useEffect(() => {
    let live = true;
    participantCandidatesAction(trainingId)
      .then((d) => live && setData(d))
      .catch(() => live && setLoadError(true));
    return () => {
      live = false;
    };
  }, [trainingId]);

  // Staff already on the list show as such and can't be picked again.
  const staff = useMemo(() => data?.staff.map((s) => ({ ...s, unavailable: s.added ? "Already added" : undefined })) ?? null, [data]);

  if (state.status === "ok")
    return (
      <div className="flex flex-col gap-4">
        <FormMessage state={state} />
        <div className="flex justify-end">
          <CancelButton label="Close" />
        </div>
      </div>
    );

  if (loadError)
    return (
      <div className="flex flex-col gap-4">
        <div className="notice notice-bad">The staff list couldn&apos;t be loaded. Close this and try again.</div>
        <div className="flex justify-end">
          <CancelButton label="Close" />
        </div>
      </div>
    );

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      {[...selected].map((id) => (
        <input key={id} type="hidden" name="staffIds" value={id} />
      ))}
      <FormMessage state={state} />
      <StaffPicker staff={staff} departments={data?.departments ?? []} selected={selected} onChange={setSelected} idPrefix="add" />
      <div className="flex justify-end gap-2 border-t border-rule pt-4">
        <CancelButton />
        <SubmitButton pending={pending} pendingLabel="Adding…" disabled={selected.size === 0}>
          {selected.size ? `Add ${plural(selected.size, "participant")}` : "Add participants"}
        </SubmitButton>
      </div>
    </form>
  );
}
