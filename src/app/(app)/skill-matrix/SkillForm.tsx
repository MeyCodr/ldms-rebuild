"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { FormMessage, SubmitButton, useFormAction } from "@/components/ui/forms";
import type { ActionState } from "@/lib/action-state";
import {
  MAX_SKILL_LINE,
  MAX_SKILL_LINES,
  MAX_SKILL_TOPIC_NAME,
  MAX_SKILL_TOPICS,
  SKILL_RATINGS,
  SKILL_SECTION_HINTS,
  SKILL_SECTION_LABELS,
  SKILL_SECTIONS,
  type SkillContent,
  type SkillSectionKey,
} from "@/lib/forms/skill";
import { skillTopicScore } from "@/server/rules/skill";

type Line = { key: number; text: string; rating: number | null };
type Topic = { key: number; section: SkillSectionKey; name: string; items: Line[] };

// Keys for React only (never put in the page, as the server and the browser count separately): topics and lines have no ids until they are saved.
let lastKey = 0;
const key = () => ++lastKey;
const blankLine = (): Line => ({ key: key(), text: "", rating: null });
const blankTopic = (section: SkillSectionKey): Topic => ({ key: key(), section, name: "", items: [blankLine()] });

/** A topic or line the person has put something in: what the server keeps (see parseSkillContent). */
const lineKept = (l: Line) => l.text.trim() !== "" || l.rating !== null;
const topicKept = (t: Topic) => t.name.trim() !== "" || t.items.some(lineKept);

/**
 * The skill matrix form: Knowledge, Skill and Ability, each a list of topics
 * with up to five rated lines. Two buttons: keep it as a draft (it may be
 * unfinished), or send it to the HOD (it must be complete).
 */
export function SkillForm({
  action,
  initial,
  staffName,
  cancelHref,
  returnReason,
}: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  /** What is on record, when editing. A new form starts with one empty topic in each section. */
  initial: SkillContent | null;
  staffName: string;
  cancelHref: string;
  /** Why the HOD sent it back, shown above the form. */
  returnReason?: string | null;
}) {
  const { state, onSubmit, pending } = useFormAction(action);
  const formId = useId();
  const [topics, setTopics] = useState<Topic[]>(() =>
    initial?.length
      ? initial.map((t) => ({
          key: key(),
          section: t.section,
          name: t.name,
          items: t.items.length ? t.items.map((i) => ({ key: key(), ...i })) : [blankLine()],
        }))
      : SKILL_SECTIONS.map(blankTopic),
  );

  const change = (topicKey: number, fn: (t: Topic) => Topic) => setTopics((all) => all.map((t) => (t.key === topicKey ? fn(t) : t)));
  const changeLine = (topicKey: number, lineKey: number, patch: Partial<Line>) =>
    change(topicKey, (t) => ({ ...t, items: t.items.map((l) => (l.key === lineKey ? { ...l, ...patch } : l)) }));

  // What is sent: sections in order, blanks left out. The server reports problems by a topic's place in this list.
  const sent = SKILL_SECTIONS.flatMap((s) => topics.filter((t) => t.section === s && topicKept(t)));
  const content: SkillContent = sent.map((t) => ({
    section: t.section,
    name: t.name,
    items: t.items.filter(lineKept).map(({ text, rating }) => ({ text, rating })),
  }));
  const errors = state.status === "error" ? state.fieldErrors : undefined;
  const topicErrors = (t: Topic) => errors?.[`topic.${sent.indexOf(t)}`];

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      <input type="hidden" name="content" value={JSON.stringify(content)} />
      {returnReason && (
        <div className="notice notice-wait flex-col gap-0.5">
          <span className="font-medium">The HOD sent this back:</span>
          <span>{returnReason}</span>
        </div>
      )}
      <FormMessage state={state} />

      <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-lg bg-sunken px-4 py-3 text-[12.5px] sm:grid-cols-5" aria-label="Ratings">
        {SKILL_RATINGS.map((r) => (
          <div key={r.value} className="flex items-baseline gap-2">
            <dt className="num w-3 shrink-0 font-semibold text-ink">{r.value}</dt>
            <dd className="font-medium text-ink">{r.label}</dd>
          </div>
        ))}
      </dl>

      {SKILL_SECTIONS.map((section) => {
        const mine = topics.filter((t) => t.section === section);
        const sectionError = errors?.[`section.${section}`]?.[0];
        const label = SKILL_SECTION_LABELS[section];
        return (
          <section key={section} aria-label={label} className="flex flex-col gap-3">
            <div>
              <h3 className="ruled-heading">{label}</h3>
              <p className="mt-2 text-[13px] text-ink-2">{SKILL_SECTION_HINTS[section]}</p>
              {sectionError && (
                <div role="alert" className="field-error">
                  {sectionError}
                </div>
              )}
            </div>

            {mine.map((t, n) => {
              const problems = topicErrors(t);
              const score = skillTopicScore(t.items.filter(lineKept));
              const nameId = `${formId}-${section}-${n}`;
              return (
                <fieldset key={t.key} className={`rounded-lg border p-3.5 ${problems ? "border-bad/60" : "border-rule"}`}>
                  <legend className="sr-only">
                    {label} topic {n + 1}
                  </legend>
                  <div className="flex items-end gap-2">
                    <div className="min-w-0 flex-1">
                      <label htmlFor={nameId} className="label">
                        {label} topic {n + 1}
                      </label>
                      <input
                        id={nameId}
                        value={t.name}
                        onChange={(e) => change(t.key, (x) => ({ ...x, name: e.target.value }))}
                        maxLength={MAX_SKILL_TOPIC_NAME}
                        className="input"
                        placeholder="e.g. Die setting"
                        autoComplete="off"
                        aria-invalid={problems ? true : undefined}
                      />
                    </div>
                    {score !== null && (
                      <span
                        className="num mb-1.5 shrink-0 text-[13px] text-ink-2"
                        title="This topic's score: its ratings added up, over the most they could be"
                      >
                        <span className="font-semibold text-ink">{score}%</span>
                      </span>
                    )}
                    <button
                      type="button"
                      className="btn btn-icon btn-bad mb-0.5 shrink-0"
                      aria-label={`Remove ${label.toLowerCase()} topic ${n + 1}`}
                      title="Remove this topic"
                      onClick={() => setTopics((all) => all.filter((x) => x.key !== t.key))}
                    >
                      <Trash2 size={14} aria-hidden />
                    </button>
                  </div>

                  <ol className="mt-3 flex flex-col gap-2">
                    {t.items.map((l, i) => (
                      <li key={l.key} className="flex flex-wrap items-center gap-x-2 gap-y-1.5 sm:flex-nowrap">
                        <span aria-hidden className="num w-4 shrink-0 text-right text-xs text-ink-3">
                          {i + 1}.
                        </span>
                        <input
                          value={l.text}
                          onChange={(e) => changeLine(t.key, l.key, { text: e.target.value })}
                          maxLength={MAX_SKILL_LINE}
                          className="input min-w-0 flex-1 basis-[calc(100%-2rem)] sm:basis-0"
                          placeholder="What the person knows or can do"
                          aria-label={`${label} topic ${n + 1}, line ${i + 1}`}
                          autoComplete="off"
                        />
                        <div
                          role="radiogroup"
                          aria-label={`Rating for ${label.toLowerCase()} topic ${n + 1}, line ${i + 1}`}
                          className="ml-6 flex shrink-0 gap-1 sm:ml-0"
                        >
                          {SKILL_RATINGS.map((r) => {
                            const on = l.rating === r.value;
                            return (
                              <button
                                key={r.value}
                                type="button"
                                role="radio"
                                aria-checked={on}
                                aria-label={`${r.value}, ${r.label}`}
                                title={r.label}
                                // Clicking the chosen rating again clears it.
                                onClick={() => changeLine(t.key, l.key, { rating: on ? null : r.value })}
                                className={`num flex size-8 cursor-pointer items-center justify-center rounded-md border text-[13px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent ${
                                  on ? "border-accent bg-accent text-white" : "border-rule-strong bg-surface text-ink-2 hover:border-accent"
                                }`}
                              >
                                {r.value}
                              </button>
                            );
                          })}
                        </div>
                        <button
                          type="button"
                          className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-ink-3 hover:bg-sunken hover:text-ink disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent"
                          aria-label={`Remove line ${i + 1} of ${label.toLowerCase()} topic ${n + 1}`}
                          title="Remove this line"
                          disabled={t.items.length === 1}
                          onClick={() => change(t.key, (x) => ({ ...x, items: x.items.filter((y) => y.key !== l.key) }))}
                        >
                          <X size={15} aria-hidden />
                        </button>
                      </li>
                    ))}
                  </ol>

                  <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 pl-6">
                    {t.items.length < MAX_SKILL_LINES ? (
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => change(t.key, (x) => ({ ...x, items: [...x.items, blankLine()] }))}>
                        <Plus size={13} aria-hidden /> Add line
                      </button>
                    ) : (
                      <span className="text-xs text-ink-3">A topic holds at most {MAX_SKILL_LINES} lines.</span>
                    )}
                    {problems && (
                      <span role="alert" className="text-xs font-medium text-bad">
                        {problems.join(" ")}
                      </span>
                    )}
                  </div>
                </fieldset>
              );
            })}

            <div>
              {mine.length < MAX_SKILL_TOPICS ? (
                <button type="button" className="btn btn-sm" onClick={() => setTopics((all) => [...all, blankTopic(section)])}>
                  <Plus size={14} aria-hidden /> Add {label.toLowerCase()} topic
                </button>
              ) : (
                <span className="text-xs text-ink-3">A section holds at most {MAX_SKILL_TOPICS} topics.</span>
              )}
            </div>
          </section>
        );
      })}

      <div className="flex flex-wrap items-center gap-2 border-t border-rule pt-5">
        <SubmitButton pending={pending} pendingLabel="Saving…" variant="secondary">
          Save as draft
        </SubmitButton>
        <button type="submit" name="intent" value="submit" className="btn btn-primary" disabled={pending} aria-busy={pending}>
          Submit to HOD
        </button>
        <Link href={cancelHref} className="btn btn-ghost">
          Cancel
        </Link>
        <span className="text-xs text-ink-3">A draft can be unfinished. To submit, every section needs a topic and every line a rating, for {staffName}.</span>
      </div>
    </form>
  );
}
