"use client";

import { startTransition, useActionState } from "react";
import { useFormStatus } from "react-dom";
import { idle, type ActionState } from "@/lib/action-state";

export function SubmitButton({
  children,
  pendingLabel,
  variant = "primary",
  className = "",
  disabled,
  pending: pendingProp,
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  pending?: boolean;
  variant?: "primary" | "danger" | "secondary";
  className?: string;
  disabled?: boolean;
}) {
  const status = useFormStatus();
  const pending = pendingProp ?? status.pending;
  const cls = variant === "primary" ? "btn-primary" : variant === "danger" ? "btn-danger" : "";
  return (
    <button type="submit" className={`btn ${cls} ${className}`} disabled={pending || disabled} aria-busy={pending}>
      {pending ? (pendingLabel ?? "Saving…") : children}
    </button>
  );
}

export function FormMessage({ state }: { state: ActionState }) {
  if (state.status === "idle") return null;
  return (
    <div role={state.status === "error" ? "alert" : "status"} className={`notice ${state.status === "ok" ? "notice-ok" : "notice-bad"}`}>
      {state.message}
    </div>
  );
}

export function Field({
  label,
  name,
  required,
  hint,
  state,
  children,
  className = "",
  id = name,
}: {
  label: string;
  name: string;
  /** The input's id, when the page holds more than one field of this name (e.g. two dialogs that each ask for a reason). Pass the same to fieldProps. */
  id?: string;
  required?: boolean;
  hint?: React.ReactNode;
  state?: ActionState;
  children: React.ReactNode;
  className?: string;
}) {
  const errors = state?.status === "error" ? state.fieldErrors?.[name] : undefined;
  return (
    <div className={className}>
      <label htmlFor={id} className={`label ${required ? "req" : ""}`}>
        {label}
      </label>
      {children}
      {errors?.length ? (
        <div id={`${id}-error`} className="field-error">
          {errors[0]}
        </div>
      ) : hint ? (
        <div className="hint">{hint}</div>
      ) : null}
    </div>
  );
}

/** Props for an input inside <Field>, wiring up aria-invalid and the error id. */
export function fieldProps(name: string, state?: ActionState, id = name) {
  const invalid = state?.status === "error" && !!state.fieldErrors?.[name]?.length;
  return {
    id,
    name,
    "aria-invalid": invalid || undefined,
    "aria-describedby": invalid ? `${id}-error` : undefined,
  };
}

/**
 * useActionState without React's automatic form reset, so what the user typed
 * stays in place when the server returns validation errors.
 */
export function useFormAction(action: (prev: ActionState, fd: FormData) => Promise<ActionState>) {
  const [state, dispatch, pending] = useActionState(action, idle);
  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
    startTransition(() => dispatch(fd));
  };
  return { state, onSubmit, pending };
}
