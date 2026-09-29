"use client";

import { useEffect, useRef } from "react";
import { Field, fieldProps, FormMessage, SubmitButton, useFormAction } from "@/components/ui/forms";
import { changePasswordAction } from "./actions";

export function PasswordForm() {
  const { state, onSubmit, pending } = useFormAction(changePasswordAction);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.status === "ok") form.current?.reset();
  }, [state]);

  return (
    <form ref={form} onSubmit={onSubmit} noValidate className="flex max-w-[360px] flex-col gap-4">
      <FormMessage state={state} />
      <Field label="Current password" name="current" required state={state} hint="If you were given a temporary password, enter it here.">
        <input {...fieldProps("current", state)} type="password" className="input" autoComplete="current-password" />
      </Field>
      <Field label="New password" name="next" required state={state} hint="At least 8 characters, with letters and numbers. Must not contain your staff no.">
        <input {...fieldProps("next", state)} type="password" className="input" autoComplete="new-password" />
      </Field>
      <Field label="Confirm new password" name="confirm" required state={state}>
        <input {...fieldProps("confirm", state)} type="password" className="input" autoComplete="new-password" />
      </Field>
      <div>
        <SubmitButton pending={pending}>Change password</SubmitButton>
      </div>
    </form>
  );
}
