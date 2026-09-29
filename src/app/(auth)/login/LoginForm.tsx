"use client";

import { Field, fieldProps, FormMessage, SubmitButton, useFormAction } from "@/components/ui/forms";
import { loginAction } from "./actions";

export function LoginForm({ from }: { from?: string }) {
  const { state, onSubmit, pending } = useFormAction(loginAction);
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="from" value={from ?? ""} />
      <FormMessage state={state} />
      <Field label="Staff no." name="staffNo" state={state}>
        <input {...fieldProps("staffNo", state)} className="input num" autoComplete="username" autoCapitalize="characters" spellCheck={false} autoFocus />
      </Field>
      <Field label="Password" name="password" state={state}>
        <input {...fieldProps("password", state)} type="password" className="input" autoComplete="current-password" />
      </Field>
      <SubmitButton pending={pending} pendingLabel="Signing in…" className="mt-1 w-full">
        Sign in
      </SubmitButton>
    </form>
  );
}
