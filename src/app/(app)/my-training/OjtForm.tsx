"use client";

import Link from "next/link";
import { useState } from "react";
import { DateField } from "@/components/ui/DateField";
import { Field, fieldProps, FormMessage, SubmitButton, useFormAction } from "@/components/ui/forms";
import { Select } from "@/components/ui/Select";
import { TimeField } from "@/components/ui/TimeField";
import type { ActionState } from "@/lib/action-state";
import { OJT_V1, type Answers } from "@/lib/forms/feedback";
import { formatHours, plural } from "@/lib/format";
import { OJT_METHOD_LABELS, OJT_METHODS, OJT_TRAINER_LABELS, OJT_TRAINERS } from "@/lib/validation/training";
import { dailyMinutes, dayNumber, trainingHours } from "@/server/rules/training";
import { QuestionFields } from "./QuestionFields";

export type OjtFormValues = {
  title: string;
  ojtMethod: string;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  venue: string;
  /** "EXTERNAL", "INTERNAL", or "" until chosen. */
  trainer: string;
};

/**
 * An OJT the person records for themselves, laid out like the old system's
 * OJT form: Section A, the OJT itself; Section B, its evaluation. The same
 * form records it and, later, edits both together.
 */
export function OjtForm({
  action,
  initial,
  answers,
  submitLabel,
  cancelHref,
  today,
}: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  initial: OjtFormValues;
  /** Section B's answers so far (null when recording a new OJT). */
  answers: Answers | null;
  submitLabel: string;
  cancelHref: string;
  /** Today in Malaysia time (YYYY-MM-DD): OJT is recorded once it has happened. */
  today: string;
}) {
  const { state, onSubmit, pending } = useFormAction(action);
  const [range, setRange] = useState({ startDate: initial.startDate, endDate: initial.endDate, startTime: initial.startTime, endTime: initial.endTime });
  const set = (field: keyof typeof range) => (value: string) =>
    setRange((r) => {
      const next = { ...r, [field]: value };
      // Most OJT is one day: the end date follows the start date until it's changed.
      if (field === "startDate" && (!r.endDate || r.endDate === r.startDate || r.endDate < value)) next.endDate = value;
      return next;
    });
  const hours = trainingHours(range);
  const days = (dayNumber(range.endDate) ?? 0) - (dayNumber(range.startDate) ?? 0) + 1;
  const perDay = dailyMinutes(range.startTime, range.endTime);

  return (
    <form onSubmit={onSubmit} noValidate className="card flex max-w-[860px] flex-col gap-7 p-5 sm:p-7">
      <FormMessage state={state} />
      <section className="flex flex-col gap-5">
        <h3 className="ruled-heading">On-the-job training</h3>
        <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
          <Field label="Title" name="title" required state={state}>
            <input {...fieldProps("title", state)} defaultValue={initial.title} className="input" maxLength={200} autoComplete="off" />
          </Field>
          <Field label="Training type" name="ojtMethod" required state={state}>
            <Select
              {...fieldProps("ojtMethod", state)}
              defaultValue={initial.ojtMethod}
              placeholder="Select type…"
              options={OJT_METHODS.map((m) => ({ value: m, label: OJT_METHOD_LABELS[m] }))}
            />
          </Field>
          <Field label="Start date" name="startDate" required state={state}>
            <DateField {...fieldProps("startDate", state)} value={range.startDate} onChange={set("startDate")} max={today} />
          </Field>
          <Field label="End date" name="endDate" required state={state}>
            <DateField {...fieldProps("endDate", state)} value={range.endDate} onChange={set("endDate")} min={range.startDate || undefined} max={today} />
          </Field>
          <Field label="Start time" name="startTime" required state={state}>
            <TimeField {...fieldProps("startTime", state)} value={range.startTime} onChange={set("startTime")} />
          </Field>
          <Field label="End time" name="endTime" required state={state}>
            <TimeField {...fieldProps("endTime", state)} value={range.endTime} onChange={set("endTime")} />
          </Field>
          <Field label="Venue" name="venue" required state={state} className="sm:col-span-2">
            <input {...fieldProps("venue", state)} defaultValue={initial.venue} className="input" maxLength={160} autoComplete="off" />
          </Field>
          <Field label="External/Internal trainer" name="trainer" required state={state}>
            <Select
              {...fieldProps("trainer", state)}
              defaultValue={initial.trainer}
              placeholder="Select type…"
              options={OJT_TRAINERS.map((t) => ({ value: t, label: OJT_TRAINER_LABELS[t] }))}
            />
          </Field>
        </div>

        <div className="flex items-baseline gap-2 rounded-lg bg-sunken px-3 py-2 text-[13px]" aria-live="polite">
          <span className="text-ink-2">OJT hours</span>
          {hours !== null ? (
            <>
              <strong className="num text-[15px] font-semibold text-ink" data-testid="live-hours">
                {formatHours(hours)}
              </strong>
              {perDay !== null && days > 1 && (
                <span className="text-xs text-ink-3">
                  {plural(days, "day")} × {formatHours(Math.round((perDay / 60) * 100) / 100)}
                </span>
              )}
            </>
          ) : (
            <span className="text-xs text-ink-3">Shown once the dates and times are valid.</span>
          )}
        </div>
      </section>

      <QuestionFields form={OJT_V1} initial={answers} state={state} />

      <div className="flex items-center gap-2 border-t border-rule pt-5">
        <SubmitButton pending={pending}>{submitLabel}</SubmitButton>
        <Link href={cancelHref} className="btn btn-ghost">
          Cancel
        </Link>
      </div>
    </form>
  );
}
