"use client";

import Link from "next/link";
import { useState } from "react";
import { DateField } from "@/components/ui/DateField";
import { Field, fieldProps, FormMessage, SubmitButton, useFormAction } from "@/components/ui/forms";
import { Select } from "@/components/ui/Select";
import { TimeField } from "@/components/ui/TimeField";
import type { ActionState } from "@/lib/action-state";
import { formatHours, plural } from "@/lib/format";
import {
  needsClassification,
  TRAINING_FUNCTION_LABELS,
  TRAINING_FUNCTIONS,
  TRAINING_PLATFORM_LABELS,
  TRAINING_PLATFORMS,
  TRAINING_PROGRAM_LABELS,
  TRAINING_PROGRAMS,
  TRAINING_TYPE_LABELS,
  type TrainingTypeCode,
} from "@/lib/validation/training";
import { dailyMinutes, dayNumber, trainingHours, usesInternalTrainer } from "@/server/rules/training";

/** Active executives and managers, plus the current trainer if they no longer qualify. */
export type TrainerOption = { id: number; name: string; staffNo: string; eligible: boolean; department: { name: string } };

/** Types offered on the form. Departmental is left out for now (still kept on edit). */
const FORM_TYPES: TrainingTypeCode[] = ["PUBLIC_INHOUSE", "OJT"];

export type TrainingFormValues = {
  type: TrainingTypeCode | "";
  title: string;
  venue: string;
  cost: string;
  /** "yes", "no", or "" until chosen. */
  hrdfClaimable: string;
  platform: string;
  function: string;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  program: string;
  trainerStaffId: number | "";
  trainerName: string;
};

/**
 * The training form. After the type, it has the same fields, in the same
 * order, as the old system's Add Training form, then the trainer: picked from
 * the staff list for an internal trainer, typed for any other program.
 */
export function TrainingForm({
  action,
  initial,
  trainers,
  submitLabel,
  cancelHref,
}: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  initial: TrainingFormValues;
  trainers: TrainerOption[];
  submitLabel: string;
  cancelHref: string;
}) {
  const { state, onSubmit, pending } = useFormAction(action);
  const [platform, setPlatform] = useState(initial.platform);
  const [program, setProgram] = useState(initial.program);
  const [range, setRange] = useState({ startDate: initial.startDate, endDate: initial.endDate, startTime: initial.startTime, endTime: initial.endTime });
  const [type, setType] = useState<string>(initial.type);
  const classify = needsClassification(type);
  const typeOptions = FORM_TYPES.includes(initial.type as TrainingTypeCode) || !initial.type ? FORM_TYPES : [...FORM_TYPES, initial.type as TrainingTypeCode];
  const optional = classify ? [] : [{ value: "", label: "None" }];

  const setRangeField = (field: keyof typeof range) => (value: string) => {
    setRange((r) => {
      const next = { ...r, [field]: value };
      // Most trainings are one day: fill the end date in when the start date is picked.
      if (field === "startDate" && (!r.endDate || r.endDate === r.startDate || r.endDate < value)) next.endDate = value;
      return next;
    });
  };

  const hours = trainingHours(range);
  const days = (dayNumber(range.endDate) ?? 0) - (dayNumber(range.startDate) ?? 0) + 1;
  const perDay = dailyMinutes(range.startTime, range.endTime);

  return (
    <form onSubmit={onSubmit} noValidate className="card flex max-w-[800px] flex-col gap-5 p-5 sm:p-7">
      <FormMessage state={state} />
      <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
        <Field label="Type" name="type" required state={state} hint={type === "OJT" ? "Platform, function and program are optional for OJT." : undefined}>
          <Select
            {...fieldProps("type", state)}
            value={type}
            onChange={setType}
            placeholder="Select type…"
            options={typeOptions.map((t) => ({ value: t, label: TRAINING_TYPE_LABELS[t] }))}
          />
        </Field>
        <div aria-hidden className="hidden sm:block" />

        <Field label="Title" name="title" required state={state}>
          <input {...fieldProps("title", state)} defaultValue={initial.title} className="input" maxLength={200} autoComplete="off" />
        </Field>
        <Field label="Venue" name="venue" state={state} hint={platform === "ONLINE" ? "e.g. Microsoft Teams, Zoom, or the provider's portal." : undefined}>
          <input {...fieldProps("venue", state)} defaultValue={initial.venue} className="input" maxLength={160} />
        </Field>

        <Field label="Cost (RM)" name="cost" state={state}>
          <input {...fieldProps("cost", state)} defaultValue={initial.cost} className="input num" inputMode="decimal" placeholder="0.00" maxLength={16} />
        </Field>
        <Field label="HRDC" name="hrdfClaimable" required state={state}>
          <Select
            {...fieldProps("hrdfClaimable", state)}
            defaultValue={initial.hrdfClaimable}
            placeholder="Select HRDC…"
            options={[
              { value: "yes", label: "Yes" },
              { value: "no", label: "No" },
            ]}
          />
        </Field>

        <Field label="Platform" name="platform" required={classify} state={state}>
          <Select
            {...fieldProps("platform", state)}
            value={platform}
            onChange={setPlatform}
            placeholder="Select platform…"
            options={[...optional, ...TRAINING_PLATFORMS.map((v) => ({ value: v, label: TRAINING_PLATFORM_LABELS[v] }))]}
          />
        </Field>
        <Field label="Function" name="function" required={classify} state={state}>
          <Select
            {...fieldProps("function", state)}
            defaultValue={initial.function}
            placeholder="Select function…"
            options={[...optional, ...TRAINING_FUNCTIONS.map((v) => ({ value: v, label: TRAINING_FUNCTION_LABELS[v] }))]}
          />
        </Field>

        <Field label="Start date" name="startDate" required state={state}>
          <DateField {...fieldProps("startDate", state)} value={range.startDate} onChange={setRangeField("startDate")} />
        </Field>
        <Field label="End date" name="endDate" required state={state}>
          <DateField {...fieldProps("endDate", state)} value={range.endDate} onChange={setRangeField("endDate")} min={range.startDate || undefined} />
        </Field>

        <Field label="Start time" name="startTime" required state={state}>
          <TimeField {...fieldProps("startTime", state)} value={range.startTime} onChange={setRangeField("startTime")} />
        </Field>
        <Field label="End time" name="endTime" required state={state}>
          <TimeField {...fieldProps("endTime", state)} value={range.endTime} onChange={setRangeField("endTime")} />
        </Field>

        <Field label="Program" name="program" required={classify} state={state}>
          <Select
            {...fieldProps("program", state)}
            value={program}
            onChange={setProgram}
            placeholder="Select program…"
            options={[...optional, ...TRAINING_PROGRAMS.map((v) => ({ value: v, label: TRAINING_PROGRAM_LABELS[v] }))]}
          />
        </Field>
        {usesInternalTrainer(program) ? (
          <Field label="Trainer" name="trainerStaffId" state={state} hint="An active executive or manager.">
            <Select
              {...fieldProps("trainerStaffId", state)}
              defaultValue={initial.trainerStaffId === "" ? "" : String(initial.trainerStaffId)}
              placeholder="Select trainer…"
              searchable
              options={[
                { value: "", label: "Not decided yet" },
                ...trainers.map((t) => ({
                  value: String(t.id),
                  label: t.eligible ? t.name : `${t.name} (no longer an active executive or manager)`,
                  hint: t.staffNo,
                  group: t.department.name,
                })),
              ]}
            />
          </Field>
        ) : (
          <Field label="Trainer" name="trainerName" state={state} hint={type === "OJT" ? "The mentor or supervisor giving the training." : undefined}>
            <input {...fieldProps("trainerName", state)} defaultValue={initial.trainerName} className="input" maxLength={160} autoComplete="off" />
          </Field>
        )}
      </div>

      <div className="flex items-baseline gap-2 rounded-md bg-sunken px-3 py-2 text-[13px]" aria-live="polite">
        <span className="text-ink-2">Training hours</span>
        {hours !== null ? (
          <>
            <strong className="num text-[15px] font-semibold text-ink" data-testid="live-hours">
              {formatHours(hours)}
            </strong>
            {perDay !== null && (
              <span className="text-xs text-ink-3">
                {plural(days, "day")} × {formatHours(Math.round((perDay / 60) * 100) / 100)}
              </span>
            )}
          </>
        ) : (
          <span className="text-xs text-ink-3">Shown once the dates and times are valid.</span>
        )}
      </div>

      <div className="flex items-center gap-2 border-t border-rule pt-4">
        <SubmitButton pending={pending}>{submitLabel}</SubmitButton>
        <Link href={cancelHref} className="btn btn-ghost">
          Cancel
        </Link>
      </div>
    </form>
  );
}
