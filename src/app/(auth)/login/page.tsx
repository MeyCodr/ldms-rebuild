import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { StepsMark, Wordmark } from "@/components/brand";
import { getCurrentUser } from "@/server/session";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Sign in" };

// What LDMS holds, in the colours each module uses inside the app.
const MODULES = [
  { label: "Training & OJT records", color: "bg-marigold" },
  { label: "Post-training evaluation (PME)", color: "bg-coral" },
  { label: "Training needs (TNA & TNI)", color: "bg-accent-bright" },
  { label: "Skill matrix", color: "bg-olive" },
];

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (await getCurrentUser()) redirect("/");
  const { from } = await searchParams;

  return (
    <div className="grid min-h-full-screen lg:grid-cols-[minmax(380px,44%)_1fr]">
      <aside className="relative hidden overflow-hidden bg-night px-12 py-12 text-night-text lg:flex lg:flex-col">
        <Wordmark onDark full />
        <div className="mt-auto max-w-sm">
          <StepsMark size={56} />
          <p className="display mt-6 text-[28px] leading-tight font-semibold text-white">Every course, evaluation and skill, recorded in one place.</p>
          <ul className="mt-8 flex flex-col gap-2.5 text-[14px]">
            {MODULES.map((m) => (
              <li key={m.label} className="flex items-center gap-3">
                <span aria-hidden className={`h-4 w-1.5 rounded-full ${m.color}`} />
                {m.label}
              </li>
            ))}
          </ul>
        </div>
        <p className="mt-12 text-xs text-night-muted">Learning &amp; Development unit, HR &amp; Administration</p>
      </aside>

      <main className="flex items-start justify-center px-4 pt-[10vh] pb-10 lg:items-center lg:pt-0">
        <div className="w-full max-w-[380px]">
          <div className="mb-8 lg:hidden">
            <Wordmark />
          </div>
          <h1 className="display text-[26px] font-semibold">Sign in</h1>
          <p className="mt-1 text-[13.5px] text-ink-2">Use your staff no. and LDMS password.</p>
          <div className="mt-6">
            <LoginForm from={typeof from === "string" ? from : undefined} />
          </div>
          <dl className="mt-8 flex flex-col gap-3 border-t border-rule pt-5 text-[13px] text-ink-2">
            <div>
              <dt className="font-medium text-ink">First time on the new LDMS?</dt>
              <dd>Sign in with the staff no. and password you used on the old system.</dd>
            </div>
            <div>
              <dt className="font-medium text-ink">Forgot your password?</dt>
              <dd>Ask the Learning &amp; Development unit to reset it. Contract staff can also ask their clerk.</dd>
            </div>
          </dl>
        </div>
      </main>
    </div>
  );
}
