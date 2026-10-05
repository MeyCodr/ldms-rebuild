import type { Clock } from "lucide-react";
import { answerLabel, type Answers, type formVersion } from "@/lib/forms/feedback";

// Pieces of a training record page, shared by My training and the OJT record.

/** A form's answers, read-only: each question with the answer given (or "No answer"). */
export function AnswerList({ form, answers }: { form: NonNullable<ReturnType<typeof formVersion>>; answers: Answers }) {
  return (
    <div className="flex flex-col gap-6">
      {form.sections.map((section) => (
        <section key={section.title}>
          <h3 className="ruled-heading">{section.title}</h3>
          <dl className="mt-1">
            {section.questions.map((q) => {
              const a = answerLabel(q, answers[q.id]);
              return (
                <div key={q.id} className="grid gap-x-6 gap-y-0.5 border-b border-rule py-2.5 text-[13.5px] last:border-b-0 sm:grid-cols-[1fr_200px]">
                  <dt className="text-ink-2">{q.text}</dt>
                  <dd className={a ? "font-medium" : "text-ink-3"}>{a ?? "No answer"}</dd>
                </div>
              );
            })}
          </dl>
        </section>
      ))}
    </div>
  );
}

export function Fact({ icon: Icon, label, children }: { icon: typeof Clock; label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 gap-3">
      <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-sunken text-ink-2">
        <Icon size={16} strokeWidth={1.9} />
      </span>
      <div className="min-w-0">
        <dt className="text-xs text-ink-3">{label}</dt>
        <dd className="mt-0.5 text-[13.5px] break-words">{children}</dd>
      </div>
    </div>
  );
}

export function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-3 border-b border-rule py-2.5 last:border-b-0">
      <dt className="text-ink-3">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}
