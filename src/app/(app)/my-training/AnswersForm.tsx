"use client";

import Link from "next/link";
import { FormMessage, SubmitButton, useFormAction } from "@/components/ui/forms";
import type { Answers, FormDefinition } from "@/lib/forms/feedback";
import { submitAnswersAction } from "./actions";
import { QuestionFields } from "./QuestionFields";

/** The feedback form, or an OJT's answers, for one of the person's trainings. */
export function AnswersForm({
  participantId,
  form,
  initial,
  submitLabel,
  cancelHref,
}: {
  participantId: number;
  form: FormDefinition;
  initial?: Answers | null;
  submitLabel: string;
  /** Where Cancel goes, when the form is on a page of its own. */
  cancelHref?: string;
}) {
  const { state, onSubmit, pending } = useFormAction(submitAnswersAction.bind(null, participantId));
  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      <FormMessage state={state} />
      <QuestionFields form={form} initial={initial} state={state} />
      <div className="flex items-center gap-2 border-t border-rule pt-5">
        <SubmitButton pending={pending} pendingLabel="Sending…">
          {submitLabel}
        </SubmitButton>
        {cancelHref && (
          <Link href={cancelHref} className="btn btn-ghost">
            Cancel
          </Link>
        )}
      </div>
    </form>
  );
}
