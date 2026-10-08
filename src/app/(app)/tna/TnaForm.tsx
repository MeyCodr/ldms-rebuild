"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { FormMessage, SubmitButton, useFormAction } from "@/components/ui/forms";
import { Select, type SelectOption } from "@/components/ui/Select";
import type { ActionState } from "@/lib/action-state";
import {
  MAX_TNA_PROBLEM,
  MAX_TNA_ROWS,
  MAX_TNA_TRAINING,
  MONTHS,
  TNA_LEVELS,
  TNA_METHOD_LABELS,
  TNA_METHODS,
  TNA_SECTION_HINTS,
  TNA_SECTIONS,
  tnaGap,
  tnaSectionTitle,
  type TnaContent,
  type TnaMethodKey,
  type TnaRow,
  type TnaSectionKey,
} from "@/lib/forms/tna";
import type { TnaFormOptions } from "@/server/services/tna";

const OTHERS = "others";

/** A row as the form holds it: what each dropdown shows, as text. */
type Row = { key: number; section: TnaSectionKey; problem: string; choice: string; other: string; target: string; current: string; method: string; month: string };

// Keys for React only (never put in the page, as the server and the browser count separately): rows have no ids until they are saved.
let lastKey = 0;
const key = () => ++lastKey;
const blankRow = (section: TnaSectionKey): Row => ({ key: key(), section, problem: "", choice: "", other: "", target: "", current: "", method: "", month: "" });

const num = (v: string) => (v ? Number(v) : null);
/** The row as it is sent. */
const sentRow = (r: Row): TnaRow => ({
  section: r.section,
  problem: r.problem,
  optionId: r.choice && r.choice !== OTHERS ? Number(r.choice) : null,
  trainingName: r.choice === OTHERS ? r.other : "",
  target: num(r.target),
  current: num(r.current),
  method: (r.method || null) as TnaMethodKey | null,
  month: num(r.month),
});
/** A row the person has put something in: what the server keeps (see parseTnaContent). */
function rowKept(r: Row): boolean {
  const s = sentRow(r);
  return !!s.problem.trim() || s.optionId !== null || !!s.trainingName.trim() || s.target !== null || s.current !== null || s.method !== null || s.month !== null;
}

const LEVEL_OPTIONS: SelectOption[] = TNA_LEVELS.map((l) => ({ value: String(l.value), label: `${l.value} · ${l.label}` }));
const METHOD_OPTIONS: SelectOption[] = TNA_METHODS.map((m) => ({ value: m, label: TNA_METHOD_LABELS[m] }));
const MONTH_OPTIONS: SelectOption[] = MONTHS.map((m, i) => ({ value: String(i + 1), label: m }));

/**
 * The TNA form: seven sections, each a list of rows the person adds. Two
 * buttons: keep it as a draft (it may be unfinished), or send it to the HOD
 * (every row must be complete). A TNA already waiting for approval is changed
 * by the HOD with Save and approve, as in the old system; L&D can also save
 * it and leave it waiting.
 */
export function TnaForm({
  action,
  initial,
  options,
  year,
  cancelHref,
  returnReason,
  withHod = false,
  canApprove = false,
  canKeepWaiting = false,
}: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  /** What is on record when editing, or last year's rows when copying forward. A new form starts empty. */
  initial: TnaContent | null;
  options: TnaFormOptions;
  year: number;
  cancelHref: string;
  /** Why it was sent back or reopened, shown above the form. */
  returnReason?: string | null;
  /** The TNA is waiting for approval. */
  withHod?: boolean;
  /** With withHod: this person's save can approve it (the HOD, L&D). */
  canApprove?: boolean;
  /** With withHod: this person can also save and leave it waiting (L&D). */
  canKeepWaiting?: boolean;
}) {
  const { state, onSubmit, pending } = useFormAction(action);
  const formId = useId();
  const [rows, setRows] = useState<Row[]>(() =>
    (initial ?? []).map((r) => ({
      key: key(),
      section: r.section,
      problem: r.problem,
      choice: r.optionId !== null ? String(r.optionId) : r.trainingName ? OTHERS : "",
      other: r.optionId === null ? r.trainingName : "",
      target: r.target?.toString() ?? "",
      current: r.current?.toString() ?? "",
      method: r.method ?? "",
      month: r.month?.toString() ?? "",
    })),
  );

  const change = (rowKey: number, patch: Partial<Row>) => setRows((all) => all.map((r) => (r.key === rowKey ? { ...r, ...patch } : r)));

  // What is sent: sections in order, blanks left out. The server reports problems by a row's place in this list.
  const sent = TNA_SECTIONS.flatMap((s) => rows.filter((r) => r.section === s && rowKept(r)));
  const content: TnaContent = sent.map(sentRow);
  const errors = state.status === "error" ? state.fieldErrors : undefined;

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      <input type="hidden" name="content" value={JSON.stringify(content)} />
      {returnReason && (
        <div className="notice notice-wait flex-col gap-0.5">
          <span className="font-medium">Sent back for changes:</span>
          <span>{returnReason}</span>
        </div>
      )}
      <FormMessage state={state} />

      <p className="max-w-[860px] text-[13px] text-ink-2">
        Complete this with your immediate superior. Think about the skills the job needs to succeed in {year}, and which of them are still missing or could be
        better. Add a row for each training need, under the heading it belongs to. Leave a heading empty if there is nothing under it.
      </p>

      <dl className="grid gap-x-5 gap-y-1.5 rounded-lg bg-sunken px-4 py-3 text-[12.5px] sm:grid-cols-2 xl:grid-cols-5" aria-label="Skill levels">
        {TNA_LEVELS.map((l) => (
          <div key={l.value} className="flex items-baseline gap-2">
            <dt className="num w-3 shrink-0 font-semibold text-ink">{l.value}</dt>
            <dd>
              <span className="font-medium text-ink">{l.label}</span>
              <span className="block text-ink-3">{l.hint}</span>
            </dd>
          </div>
        ))}
      </dl>

      {TNA_SECTIONS.map((section) => {
        const mine = rows.filter((r) => r.section === section);
        const sectionError = errors?.[`section.${section}`]?.[0];
        const title = tnaSectionTitle(section);
        const groups = options[section].some((o) => o.group !== null);
        const trainingOptions: SelectOption[] = [
          ...options[section].map((o) => ({ value: String(o.id), label: o.name, group: o.group ?? undefined, hint: o.active ? undefined : "no longer offered" })),
          { value: OTHERS, label: "Others (type the name)", group: groups ? "Not on the list" : undefined },
        ];
        return (
          <section key={section} aria-label={title} className="flex flex-col gap-3">
            <div>
              <h3 className="ruled-heading">{title}</h3>
              {TNA_SECTION_HINTS[section] && <p className="mt-2 text-[13px] text-ink-2">{TNA_SECTION_HINTS[section]}</p>}
              {sectionError && (
                <div role="alert" className="field-error">
                  {sectionError}
                </div>
              )}
            </div>

            {mine.map((r, n) => {
              const problems = errors?.[`row.${sent.indexOf(r)}`];
              const gap = tnaGap(num(r.target), num(r.current));
              // Ids come from the row's place, not its React key: the key counter differs between the server and the browser.
              const id = (part: string) => `${formId}-${section}-${n}-${part}`;
              const field = (part: string) => `${part}-${section}-${n}`;
              const name = `${title}, row ${n + 1}`;
              return (
                <fieldset key={r.key} className={`rounded-lg border p-3.5 ${problems ? "border-bad/60" : "border-rule"}`}>
                  <legend className="sr-only">{name}</legend>
                  <div className="grid gap-x-4 gap-y-3 lg:grid-cols-2">
                    <div>
                      <label htmlFor={id("problem")} className="label">
                        Problem statement
                      </label>
                      <textarea
                        id={id("problem")}
                        value={r.problem}
                        onChange={(e) => change(r.key, { problem: e.target.value })}
                        maxLength={MAX_TNA_PROBLEM}
                        rows={3}
                        className="textarea"
                        placeholder="What can't be done well enough yet, and what it holds back"
                        aria-label={`Problem statement, ${name}`}
                      />
                    </div>
                    <div className="flex flex-col gap-3">
                      <div>
                        <label htmlFor={id("training")} className="label">
                          Training required
                        </label>
                        <Select
                          id={id("training")}
                          name={field("training")}
                          value={r.choice}
                          onChange={(choice) => change(r.key, { choice })}
                          options={trainingOptions}
                          placeholder="Choose a training"
                          searchable
                        />
                      </div>
                      {r.choice === OTHERS && (
                        <div>
                          <label htmlFor={id("other")} className="label">
                            Name of the training
                          </label>
                          <input
                            id={id("other")}
                            value={r.other}
                            onChange={(e) => change(r.key, { other: e.target.value })}
                            maxLength={MAX_TNA_TRAINING}
                            className="input"
                            autoComplete="off"
                            aria-label={`Name of the training, ${name}`}
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-2 items-end gap-x-4 gap-y-3 sm:grid-cols-[1fr_1fr_64px] lg:grid-cols-[1fr_1fr_64px_1fr_120px_auto]">
                    <div>
                      <label htmlFor={id("target")} className="label">
                        Target skill
                      </label>
                      <Select id={id("target")} name={field("target")} value={r.target} onChange={(target) => change(r.key, { target })} options={LEVEL_OPTIONS} placeholder="1 to 5" />
                    </div>
                    <div>
                      <label htmlFor={id("current")} className="label">
                        Current skill
                      </label>
                      <Select id={id("current")} name={field("current")} value={r.current} onChange={(current) => change(r.key, { current })} options={LEVEL_OPTIONS} placeholder="1 to 5" />
                    </div>
                    <div className="col-span-2 sm:col-span-1">
                      <span className="label">Gap</span>
                      <span role="img" className="num flex h-9 items-center text-[13.5px] font-semibold" aria-label={`Gap, ${name}: ${gap ?? "not worked out yet"}`} title="Target minus current">
                        {gap ?? <span className="font-normal text-ink-3">–</span>}
                      </span>
                    </div>
                    <div>
                      <label htmlFor={id("method")} className="label">
                        How will this be achieved?
                      </label>
                      <Select id={id("method")} name={field("method")} value={r.method} onChange={(method) => change(r.key, { method })} options={METHOD_OPTIONS} placeholder="Choose" />
                    </div>
                    <div>
                      <label htmlFor={id("month")} className="label">
                        When
                      </label>
                      <Select id={id("month")} name={field("month")} value={r.month} onChange={(month) => change(r.key, { month })} options={MONTH_OPTIONS} placeholder="Month" searchable={false} />
                    </div>
                    <div className="col-span-2 flex items-end justify-end sm:col-span-3 lg:col-span-1">
                      <button
                        type="button"
                        className="btn btn-icon btn-bad mb-0.5"
                        aria-label={`Remove ${name}`}
                        title="Remove this row"
                        onClick={() => setRows((all) => all.filter((x) => x.key !== r.key))}
                      >
                        <Trash2 size={14} aria-hidden />
                      </button>
                    </div>
                  </div>
                  {problems && (
                    <p role="alert" className="mt-2.5 text-xs font-medium text-bad">
                      {problems.join(" ")}
                    </p>
                  )}
                </fieldset>
              );
            })}

            <div>
              {mine.length < MAX_TNA_ROWS ? (
                <button type="button" className="btn btn-sm" aria-label={`Add a row under ${title}`} onClick={() => setRows((all) => [...all, blankRow(section)])}>
                  <Plus size={14} aria-hidden /> Add row
                </button>
              ) : (
                <span className="text-xs text-ink-3">A section holds at most {MAX_TNA_ROWS} rows.</span>
              )}
            </div>
          </section>
        );
      })}

      <div className="flex flex-wrap items-center gap-2 border-t border-rule pt-5">
        {withHod ? (
          <>
            {canKeepWaiting && (
              <SubmitButton pending={pending} pendingLabel="Saving…" variant={canApprove ? "secondary" : "primary"}>
                Save changes
              </SubmitButton>
            )}
            {canApprove && (
              <button type="submit" name="intent" value="approve" className="btn btn-primary" disabled={pending} aria-busy={pending}>
                Save and approve
              </button>
            )}
          </>
        ) : (
          <>
            <SubmitButton pending={pending} pendingLabel="Saving…" variant="secondary">
              Save as draft
            </SubmitButton>
            <button type="submit" name="intent" value="submit" className="btn btn-primary" disabled={pending} aria-busy={pending}>
              Submit to HOD
            </button>
          </>
        )}
        <Link href={cancelHref} className="btn btn-ghost">
          Cancel
        </Link>
        <span className="text-xs text-ink-3">
          {withHod ? (canApprove ? "Approving locks it, so every row must be complete. To have it changed by whoever filled it in, send it back instead." : "It stays waiting for approval, so every row must be complete.") : "A draft can be unfinished. To submit, every row needs all of its parts."}
        </span>
      </div>
    </form>
  );
}
