"use client";

import Link from "next/link";
import { useState } from "react";
import { StaffPicker, type PickerDepartment, type PickerStaff } from "@/components/StaffPicker";
import { DateField } from "@/components/ui/DateField";
import { Field, fieldProps, FormMessage, SubmitButton, useFormAction } from "@/components/ui/forms";
import { Select } from "@/components/ui/Select";
import { TimeField } from "@/components/ui/TimeField";
import { formatHours, plural } from "@/lib/format";
import { OJT_METHOD_LABELS, OJT_METHODS, OJT_TRAINER_LABELS, OJT_TRAINERS } from "@/lib/validation/training";
import { SHORT_OJT_HOURS } from "@/server/rules/ojt";
import { dailyMinutes, dayNumber, trainingHours } from "@/server/rules/training";
import { recordOjtEntryAction, updateOjtEntryAction } from "../actions";

/** An OJT already recorded, to edit: the record it was opened from, and the form's values. */
export type OjtEntryEdit = {
  participantId: number;
  values: {
    title: string;
    ojtMethod: string;
    startDate: string;
    endDate: string;
    startTime: string;
    endTime: string;
    venue: string;
    trainer: string;
    trainerName: string;
  };
  staffIds: number[];
};

/**
 * One OJT for several staff: the OJT form's Section A, the trainer's name,
 * and who attended. Clerks are offered only the staff they may record for.
 * With `edit`, it changes an OJT already recorded: unticking someone takes
 * them off it.
 */
export function OjtEntryForm({
  staff,
  departments,
  today,
  contractOnly,
  edit,
}: {
  staff: PickerStaff[];
  departments: PickerDepartment[];
  /** Today in Malaysia time (YYYY-MM-DD): OJT is recorded once it has happened. */
  today: string;
  contractOnly: boolean;
  edit?: OjtEntryEdit;
}) {
  const { state, onSubmit, pending } = useFormAction(edit ? updateOjtEntryAction.bind(null, edit.participantId) : recordOjtEntryAction);
  const v = edit?.values;
  const [range, setRange] = useState(
    v
      ? { startDate: v.startDate, endDate: v.endDate, startTime: v.startTime, endTime: v.endTime }
      : { startDate: today, endDate: today, startTime: "08:30", endTime: "17:30" },
  );
  const [selected, setSelected] = useState<Set<number>>(new Set(edit?.staffIds));
  const cancelHref = edit ? `/ojt/${edit.participantId}` : "/ojt";
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
  const staffError = state.status === "error" ? state.fieldErrors?.staffIds?.[0] : undefined;

  return (
    <form onSubmit={onSubmit} noValidate className="card flex max-w-[960px] flex-col gap-7 p-5 sm:p-7">
      {[...selected].map((id) => (
        <input key={id} type="hidden" name="staffIds" value={id} />
      ))}
      <FormMessage state={state} />

      <section className="flex flex-col gap-5">
        <h3 className="ruled-heading">On-the-job training</h3>
        <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
          <Field label="Title" name="title" required state={state}>
            <input {...fieldProps("title", state)} defaultValue={v?.title} className="input" maxLength={200} autoComplete="off" />
          </Field>
          <Field label="Training type" name="ojtMethod" required state={state}>
            <Select
              {...fieldProps("ojtMethod", state)}
              defaultValue={v?.ojtMethod}
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
            <input {...fieldProps("venue", state)} defaultValue={v?.venue} className="input" maxLength={160} autoComplete="off" />
          </Field>
          <Field label="External/Internal trainer" name="trainer" required state={state}>
            <Select
              {...fieldProps("trainer", state)}
              defaultValue={v?.trainer}
              placeholder="Select type…"
              options={OJT_TRAINERS.map((t) => ({ value: t, label: OJT_TRAINER_LABELS[t] }))}
            />
          </Field>
          <Field label="Trainer name" name="trainerName" required state={state}>
            <input {...fieldProps("trainerName", state)} defaultValue={v?.trainerName} className="input" maxLength={160} autoComplete="off" />
          </Field>
        </div>

        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-lg bg-sunken px-3 py-2 text-[13px]" aria-live="polite">
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
              {/* What happens to each person, as in the Excel template's instructions. */}
              <span className="text-xs text-ink-2" data-testid="entry-outcome">
                ·{" "}
                {hours <= SHORT_OJT_HOURS
                  ? `${SHORT_OJT_HOURS} hours or less: everyone ${edit ? "without answers yet counts" : "is recorded"} as completed.`
                  : `Each person ${edit ? "without answers yet " : ""}gives their answers on My training, which completes it for them.`}
              </span>
            </>
          ) : (
            <span className="text-xs text-ink-3">Shown once the dates and times are valid.</span>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="ojt-staff-heading">
        <h3 id="ojt-staff-heading" className="ruled-heading">
          Staff
        </h3>
        <p className="-mt-1 text-[13px] text-ink-2">
          {contractOnly
            ? "Contract staff you can record OJT for. Pick them by name, or narrow to a department or section and select everyone in it."
            : "Pick staff by name, or narrow to a department or section and select everyone in it."}
        </p>
        <StaffPicker staff={staff} departments={departments} selected={selected} onChange={setSelected} idPrefix="ojt" />
        {staffError && (
          <div id="staffIds-error" className="field-error">
            {staffError}
          </div>
        )}
      </section>

      <div className="flex items-center gap-2 border-t border-rule pt-5">
        {edit ? (
          <SubmitButton pending={pending} pendingLabel="Saving…">
            Save changes
          </SubmitButton>
        ) : (
          <SubmitButton pending={pending} pendingLabel="Recording…">
            {selected.size ? `Record OJT for ${plural(selected.size, "staff member")}` : "Record OJT"}
          </SubmitButton>
        )}
        <Link href={cancelHref} className="btn btn-ghost">
          Cancel
        </Link>
      </div>
    </form>
  );
}
