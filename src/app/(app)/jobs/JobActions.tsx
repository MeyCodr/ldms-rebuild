"use client";

import { useState } from "react";
import { Play, Send, Settings2 } from "lucide-react";
import { CancelButton, DialogButton } from "@/components/ui/Dialog";
import { Field, fieldProps, FormMessage, SubmitButton, useFormAction } from "@/components/ui/forms";
import type { ActionState } from "@/lib/action-state";
import type { MailMode } from "@/server/rules/mail";
import { runDailyJobAction, sendReminderCopyAction, sendTestEmailAction, setMailModeAction } from "./actions";

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

function Confirm({ action, children, submitLabel, pendingLabel }: { action: (prev: ActionState) => Promise<ActionState>; children: React.ReactNode; submitLabel: string; pendingLabel: string }) {
  const { state, onSubmit, pending } = useFormAction(action);
  if (state.status === "ok") return <Done state={state} />;
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <FormMessage state={state} />
      <div className="text-[13px] text-ink-2">{children}</div>
      <div className="flex justify-end gap-2 border-t border-rule pt-4">
        <CancelButton />
        <SubmitButton pending={pending} pendingLabel={pendingLabel}>
          {submitLabel}
        </SubmitButton>
      </div>
    </form>
  );
}

/** Sends the signed-in person one email, to see that this server can send. */
export function TestEmailDialog({ goesTo, block, sending }: { goesTo: string | null; block: string | null; sending: boolean }) {
  return (
    <DialogButton
      label={
        <>
          <Send size={14} aria-hidden /> Send a test email
        </>
      }
      title="Send a test email"
    >
      {block || !goesTo ? (
        <div className="flex flex-col gap-4">
          <div className="notice notice-wait">{block ?? "There is nowhere to send it."}</div>
          <div className="flex justify-end">
            <CancelButton label="Close" />
          </div>
        </div>
      ) : (
        <Confirm action={sendTestEmailAction} submitLabel="Send" pendingLabel="Sending…">
          {sending ? (
            <>
              One short email goes to <span className="font-medium break-all text-ink">{goesTo}</span>, to check that this server can send email. It is listed
              under Emails below, sent or not.
            </>
          ) : (
            <>
              Email is off, so the email to <span className="font-medium break-all text-ink">{goesTo}</span> is only recorded under Emails below; none is really
              sent. Change the email mode to Test first to check that this server can send email.
            </>
          )}
        </Confirm>
      )}
    </DialogButton>
  );
}

/** On a person's reminder preview: L&D send themselves a copy, to see it in their own mail program. */
export function ReminderCopyDialog({ staffId, name, goesTo, sending }: { staffId: number; name: string; goesTo: string | null; sending: boolean }) {
  return (
    <DialogButton
      label={
        <>
          <Send size={14} aria-hidden /> Send this email to me
        </>
      }
      title="Send this email to me"
    >
      {!goesTo ? (
        <div className="flex flex-col gap-4">
          <div className="notice notice-wait">Your staff record has no email address, so there is nowhere to send it.</div>
          <div className="flex justify-end">
            <CancelButton label="Close" />
          </div>
        </div>
      ) : (
        <Confirm action={sendReminderCopyAction.bind(null, staffId)} submitLabel="Send" pendingLabel="Sending…">
          A copy of {name}&apos;s reminder goes to <span className="font-medium break-all text-ink">{goesTo}</span>
          {sending ? ", so you can see it in your own mail program." : ". Email is off, so it is only recorded, not sent."} Nothing is sent to {name}, and it doesn&apos;t
          count as their reminder for today.
        </Confirm>
      )}
    </DialogButton>
  );
}

/** L&D's Run now for the daily job. */
export function RunJobDialog() {
  return (
    <DialogButton
      variant="primary"
      label={
        <>
          <Play size={14} aria-hidden /> Run now
        </>
      }
      title="Run the daily job now"
    >
      <Confirm action={runDailyJobAction} submitLabel="Run now" pendingLabel="Running…">
        It does what the server does by itself each morning: writes today&apos;s reminder for everyone with something waiting, sends every email still waiting, tries
        failed ones again, and removes records older than 90 days. No one gets today&apos;s reminder twice, so running it again is harmless.
      </Confirm>
    </DialogButton>
  );
}

const MODES: { value: MailMode; label: string; says: string }[] = [
  { value: "OFF", label: "Off", says: "Nothing is sent. Each email is only recorded on this screen." },
  { value: "TEST", label: "Test", says: "Emails are really sent, but every one goes to the test address, not to staff." },
  { value: "LIVE", label: "Live", says: "Emails are really sent to staff, at the address on their staff record." },
];

function MailModeForm({ mode, address, serverBlock }: { mode: MailMode; address: string; serverBlock: string | null }) {
  const { state, onSubmit, pending } = useFormAction(setMailModeAction);
  const [chosen, setChosen] = useState<MailMode>(mode);
  if (state.status === "ok") return <Done state={state} />;
  // Test and Live really send, which needs the mail server set up on this server.
  const blocked = chosen !== "OFF" && serverBlock;
  const goingLive = chosen === "LIVE" && mode !== "LIVE";
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <FormMessage state={state} />
      <fieldset className="flex flex-col gap-2">
        <legend className="label">Email is</legend>
        {MODES.map((m) => (
          <label
            key={m.value}
            className="flex cursor-pointer items-start gap-3 rounded-lg border border-rule-strong px-3 py-2.5 transition-colors has-[:checked]:border-accent has-[:checked]:bg-accent-soft has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent hover:bg-sunken"
          >
            <input type="radio" name="mode" value={m.value} checked={chosen === m.value} onChange={() => setChosen(m.value)} className="mt-0.5 accent-accent" />
            <span className="min-w-0">
              <span className="block text-[13.5px] font-medium text-ink">{m.label}</span>
              <span className="block text-[12.5px] text-ink-2">{m.says}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {chosen === "TEST" && (
        <Field label="Test address" name="address" required state={state} hint="Every email goes here, with the person it was meant for named in the subject.">
          <input className="input" type="email" maxLength={160} autoComplete="off" defaultValue={address} {...fieldProps("address", state)} />
        </Field>
      )}
      {blocked ? (
        <div className="notice notice-wait">{serverBlock}</div>
      ) : (
        goingLive && (
          <div className="notice notice-bad">
            From the next email, real staff receive email from LDMS. Do this only once L&amp;D have read the test emails and agreed the wording. It can be changed back
            at any time.
          </div>
        )
      )}
      <div className="flex justify-end gap-2 border-t border-rule pt-4">
        <CancelButton />
        <SubmitButton pending={pending} pendingLabel="Saving…" variant={goingLive ? "danger" : "primary"} disabled={!!blocked}>
          {goingLive ? "Go live" : "Save"}
        </SubmitButton>
      </div>
    </form>
  );
}

/** One control for whether email is sent and to whom: Off, Test or Live. Every change is in the audit log. */
export function MailModeDialog({ mode, address, serverBlock }: { mode: MailMode; address: string; serverBlock: string | null }) {
  return (
    <DialogButton
      variant="primary"
      label={
        <>
          <Settings2 size={14} aria-hidden /> Change email mode
        </>
      }
      title="Change email mode"
    >
      <MailModeForm mode={mode} address={address} serverBlock={serverBlock} />
    </DialogButton>
  );
}
