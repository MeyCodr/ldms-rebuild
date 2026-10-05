"use client";

import { KeyRound, RotateCcw, UserX } from "lucide-react";
import { DateField } from "@/components/ui/DateField";
import { CancelButton, DialogButton } from "@/components/ui/Dialog";
import { Field, fieldProps, FormMessage, SubmitButton, useFormAction } from "@/components/ui/forms";
import type { ActionState } from "@/lib/action-state";
import { nowInMalaysia } from "@/lib/format";
import { reinstateAction, resetPasswordAction, resignAction, setRolesAction } from "../actions";

/** After a successful dialog action: the message and a Close button. */
function Done({ state }: { state: ActionState }) {
  return (
    <div className="flex flex-col gap-4">
      <FormMessage state={state} />
      <div className="flex justify-end">
        <CancelButton label="Close" />
      </div>
    </div>
  );
}

export function ResignDialog({ id, name, hodNote, hidden }: { id: number; name: string; hodNote?: string; hidden?: boolean }) {
  return (
    <DialogButton
      hideTrigger={hidden}
      label={
        <>
          <UserX size={14} aria-hidden /> Mark as resigned
        </>
      }
      title={`Mark ${name} as resigned`}
      description="They will no longer be able to sign in, and will drop out of headcount and approver lists. Their training history is kept."
    >
      <ResignForm id={id} hodNote={hodNote} />
    </DialogButton>
  );
}

function ResignForm({ id, hodNote }: { id: number; hodNote?: string }) {
  const { state, onSubmit, pending } = useFormAction(resignAction.bind(null, id));
  const today = nowInMalaysia().toISOString().slice(0, 10);
  if (state.status === "ok") return <Done state={state} />;
  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <FormMessage state={state} />
      {hodNote && <div className="notice notice-wait">{hodNote}</div>}
      <Field label="Last working day" name="dateResigned" required state={state}>
        <DateField {...fieldProps("dateResigned", state)} defaultValue={today} className="w-48" />
      </Field>
      <div className="flex justify-end gap-2 border-t border-rule pt-4">
        <CancelButton />
        <SubmitButton variant="danger" pending={pending}>
          Mark as resigned
        </SubmitButton>
      </div>
    </form>
  );
}

export function ReinstateDialog({ id, name, hidden }: { id: number; name: string; hidden?: boolean }) {
  return (
    <DialogButton hideTrigger={hidden} label={
        <>
          <RotateCcw size={14} aria-hidden /> Reinstate
        </>
      }
      title={`Reinstate ${name}`} description="Use this when a resignation was recorded by mistake, or the staff member has rejoined.">
      <ReinstateForm id={id} />
    </DialogButton>
  );
}

function ReinstateForm({ id }: { id: number }) {
  const { state, onSubmit, pending } = useFormAction(reinstateAction.bind(null, id));
  if (state.status === "ok") return <Done state={state} />;
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <FormMessage state={state} />
      <p className="text-[13px] text-ink-2">They will be able to sign in again with their existing password. HOD and division-head assignments are not restored.</p>
      <div className="flex justify-end gap-2 border-t border-rule pt-4">
        <CancelButton />
        <SubmitButton pending={pending} pendingLabel="Reinstating…">
          Reinstate
        </SubmitButton>
      </div>
    </form>
  );
}

export function ResetPasswordDialog({ id, name, staffNo }: { id: number; name: string; staffNo: string }) {
  return (
    <DialogButton
      label={
        <>
          <KeyRound size={14} aria-hidden /> Reset password
        </>
      }
      title={`Reset password for ${name}`} description={`Staff no. ${staffNo}`}>
      <ResetPasswordForm id={id} />
    </DialogButton>
  );
}

function ResetPasswordForm({ id }: { id: number }) {
  const { state, onSubmit, pending } = useFormAction(resetPasswordAction.bind(null, id));
  if (state.status === "ok") return <Done state={state} />;
  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <FormMessage state={state} />
      <Field label="Temporary password" name="password" required state={state} hint="At least 8 characters with letters and numbers. They must change it when they sign in.">
        <input {...fieldProps("password", state)} type="text" className="input num" autoComplete="off" spellCheck={false} />
      </Field>
      <div className="flex justify-end gap-2 border-t border-rule pt-4">
        <CancelButton />
        <SubmitButton pending={pending}>Reset password</SubmitButton>
      </div>
    </form>
  );
}

export function RolesForm({
  id,
  current,
  options,
}: {
  id: number;
  current: string[];
  options: { code: string; label: string; description: string }[];
}) {
  const { state, onSubmit, pending } = useFormAction(setRolesAction.bind(null, id));
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <fieldset className="flex flex-col gap-2">
        <legend className="sr-only">Roles</legend>
        {options.map((o) => (
          <label key={o.code} className="flex gap-2.5 text-[13px]">
            <input type="checkbox" name="roles" value={o.code} defaultChecked={current.includes(o.code)} className="mt-0.5 accent-primary" />
            <span>
              <span className="font-medium">{o.label}</span>
              <span className="block text-xs text-ink-3">{o.description}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <div className="flex items-center gap-3">
        <SubmitButton variant="secondary" pending={pending} className="btn-sm">
          Save access
        </SubmitButton>
        {state.status === "ok" && (
          <span role="status" className="text-xs text-ok">
            Saved
          </span>
        )}
      </div>
      {state.status === "error" && <FormMessage state={state} />}
    </form>
  );
}
