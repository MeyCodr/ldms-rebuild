"use client";

import { SlidersHorizontal } from "lucide-react";
import { DateField } from "@/components/ui/DateField";
import { CancelButton, DialogButton } from "@/components/ui/Dialog";
import { Field, fieldProps, FormMessage, SubmitButton, useFormAction } from "@/components/ui/forms";
import { REMINDER_INFO, REMINDER_KINDS, type ReminderSwitches } from "@/server/rules/reminder";
import { setRemindersAction } from "./actions";

function Form({ switches, chaseFrom }: { switches: ReminderSwitches; chaseFrom: string }) {
  const { state, onSubmit, pending } = useFormAction(setRemindersAction);
  if (state.status === "ok")
    return (
      <div className="flex flex-col gap-4">
        <FormMessage state={state} />
        <div className="flex justify-end">
          <CancelButton label="Close" />
        </div>
      </div>
    );
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <FormMessage state={state} />
      <fieldset>
        <legend className="label">Remind people about</legend>
        <div className="flex flex-col">
          {REMINDER_KINDS.map((k) => (
            <label key={k} className="flex cursor-pointer items-start gap-2.5 border-b border-rule py-2 text-[13.5px] last:border-b-0">
              <input type="checkbox" name="kind" value={k} defaultChecked={switches[k]} className="mt-0.5 accent-primary" />
              <span className="min-w-0">
                <span className="block text-ink">{REMINDER_INFO[k].label}</span>
                <span className="block text-xs text-ink-3">To: {REMINDER_INFO[k].who.toLowerCase()}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <Field
        label="Chase from"
        name="chaseFrom"
        state={state}
        hint="Anything that became due before this day is left out of the emails. It still shows on screen. Leave empty to chase everything."
      >
        <DateField {...fieldProps("chaseFrom", state)} defaultValue={chaseFrom} />
      </Field>
      <div className="flex justify-end gap-2 border-t border-rule pt-4">
        <CancelButton />
        <SubmitButton pending={pending} pendingLabel="Saving…">
          Save
        </SubmitButton>
      </div>
    </form>
  );
}

/** L&D choose which reminders go out, and the day to chase from. */
export function ReminderSettingsDialog({ switches, chaseFrom }: { switches: ReminderSwitches; chaseFrom: string }) {
  return (
    <DialogButton
      label={
        <>
          <SlidersHorizontal size={14} aria-hidden /> Change reminders
        </>
      }
      title="Change reminders"
      width={520}
    >
      <Form switches={switches} chaseFrom={chaseFrom} />
    </DialogButton>
  );
}
