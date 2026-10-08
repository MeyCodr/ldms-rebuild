"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { FormMessage, SubmitButton, useFormAction } from "@/components/ui/forms";
import { Select, type SelectOption } from "@/components/ui/Select";
import type { ActionState } from "@/lib/action-state";
import { TNA_LEVELS, TNA_METHOD_LABELS, TNA_METHODS, tnaGap, type TnaMethodKey } from "@/lib/forms/tna";
import { MAX_TNI_ASK, MAX_TNI_CAUSES, MAX_TNI_EVALUATION, MAX_TNI_INDICATOR, MAX_TNI_ROWS, TNI_HEADING, type TniContent, type TniRow } from "@/lib/forms/tni";

/** A row as the form holds it: what each dropdown shows, as text. */
type Row = { key: number; indicator: string; expected: string; actual: string; causes: string; ask: string; method: string; evaluation: string };

// Keys for React only (never put in the page, as the server and the browser count separately): rows have no ids until they are saved.
let lastKey = 0;
const key = () => ++lastKey;
const blankRow = (): Row => ({ key: key(), indicator: "", expected: "", actual: "", causes: "", ask: "", method: "", evaluation: "" });

const num = (v: string) => (v ? Number(v) : null);
const sentRow = (r: Row): TniRow => ({
  indicator: r.indicator,
  expected: num(r.expected),
  actual: num(r.actual),
  causes: r.causes,
  ask: r.ask,
  method: (r.method || null) as TnaMethodKey | null,
  evaluation: r.evaluation,
});
/** A row the person has put something in: what the server keeps (see parseTniContent). */
function rowKept(r: Row): boolean {
  const s = sentRow(r);
  return !!(s.indicator.trim() || s.causes.trim() || s.ask.trim() || s.evaluation.trim()) || s.expected !== null || s.actual !== null || s.method !== null;
}

const LEVEL_OPTIONS: SelectOption[] = TNA_LEVELS.map((l) => ({ value: String(l.value), label: `${l.value} · ${l.label}` }));
const METHOD_OPTIONS: SelectOption[] = TNA_METHODS.map((m) => ({ value: m, label: TNA_METHOD_LABELS[m] }));

/**
 * The TNI form: one list of rows for the department. There are no drafts:
 * saving puts the list on record, so every row must be complete.
 */
export function TniForm({
  action,
  initial,
  cancelHref,
}: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  /** What is on record, or last year's rows when copying forward. A new form starts with one empty row. */
  initial: TniContent;
  cancelHref: string;
}) {
  const { state, onSubmit, pending } = useFormAction(action);
  const formId = useId();
  const [rows, setRows] = useState<Row[]>(() =>
    initial.length
      ? initial.map((r) => ({
          key: key(),
          indicator: r.indicator,
          expected: r.expected?.toString() ?? "",
          actual: r.actual?.toString() ?? "",
          causes: r.causes,
          ask: r.ask,
          method: r.method ?? "",
          evaluation: r.evaluation,
        }))
      : [blankRow()],
  );
  const change = (rowKey: number, patch: Partial<Row>) => setRows((all) => all.map((r) => (r.key === rowKey ? { ...r, ...patch } : r)));

  // What is sent: blanks left out. The server reports problems by a row's place in this list.
  const sent = rows.filter(rowKept);
  const content: TniContent = sent.map(sentRow);
  const errors = state.status === "error" ? state.fieldErrors : undefined;

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      <input type="hidden" name="content" value={JSON.stringify(content)} />
      <FormMessage state={state} />

      <dl className="grid gap-x-5 gap-y-1.5 rounded-lg bg-sunken px-4 py-3 text-[12.5px] sm:grid-cols-2 xl:grid-cols-5" aria-label="Performance levels">
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

      <section aria-label={TNI_HEADING} className="flex flex-col gap-3">
        <h3 className="ruled-heading">{TNI_HEADING}</h3>

        {rows.map((r, n) => {
          const problems = errors?.[`row.${sent.indexOf(r)}`];
          const gap = tnaGap(num(r.expected), num(r.actual));
          // Ids come from the row's place, not its React key: the key counter differs between the server and the browser.
          const id = (part: string) => `${formId}-${n}-${part}`;
          const name = `Row ${n + 1}`;
          return (
            <fieldset key={r.key} className={`rounded-lg border p-3.5 ${problems ? "border-bad/60" : "border-rule"}`}>
              <legend className="sr-only">{name}</legend>
              <div className="grid gap-x-4 gap-y-3 lg:grid-cols-2">
                <div>
                  <label htmlFor={id("indicator")} className="label">
                    Performance indicator
                  </label>
                  <textarea
                    id={id("indicator")}
                    value={r.indicator}
                    onChange={(e) => change(r.key, { indicator: e.target.value })}
                    maxLength={MAX_TNI_INDICATOR}
                    rows={3}
                    className="textarea"
                    placeholder="Critical to quality or to the process"
                  />
                </div>
                <div>
                  <label htmlFor={id("causes")} className="label">
                    Possible causes
                  </label>
                  <textarea id={id("causes")} value={r.causes} onChange={(e) => change(r.key, { causes: e.target.value })} maxLength={MAX_TNI_CAUSES} rows={3} className="textarea" />
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 items-end gap-x-4 gap-y-3 sm:grid-cols-[1fr_1fr_64px] lg:grid-cols-[1fr_1fr_64px_1fr_1fr]">
                <div>
                  <label htmlFor={id("expected")} className="label">
                    Expected performance
                  </label>
                  <Select id={id("expected")} name={`expected-${n}`} value={r.expected} onChange={(expected) => change(r.key, { expected })} options={LEVEL_OPTIONS} placeholder="1 to 5" />
                </div>
                <div>
                  <label htmlFor={id("actual")} className="label">
                    Actual performance
                  </label>
                  <Select id={id("actual")} name={`actual-${n}`} value={r.actual} onChange={(actual) => change(r.key, { actual })} options={LEVEL_OPTIONS} placeholder="1 to 5" />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <span className="label">Gap</span>
                  <span role="img" className="num flex h-9 items-center text-[13.5px] font-semibold" aria-label={`Gap, row ${n + 1}: ${gap ?? "not worked out yet"}`} title="Expected minus actual">
                    {gap ?? <span className="font-normal text-ink-3">–</span>}
                  </span>
                </div>
                <div>
                  <label htmlFor={id("ask")} className="label">
                    Attitude / Skill / Knowledge
                  </label>
                  <input id={id("ask")} value={r.ask} onChange={(e) => change(r.key, { ask: e.target.value })} maxLength={MAX_TNI_ASK} className="input" autoComplete="off" />
                </div>
                <div>
                  <label htmlFor={id("method")} className="label">
                    L&amp;D method
                  </label>
                  <Select id={id("method")} name={`method-${n}`} value={r.method} onChange={(method) => change(r.key, { method })} options={METHOD_OPTIONS} placeholder="Choose" />
                </div>
              </div>

              <div className="mt-3 flex items-end gap-3">
                <div className="min-w-0 flex-1">
                  <label htmlFor={id("evaluation")} className="label">
                    Evaluation method
                  </label>
                  <input
                    id={id("evaluation")}
                    value={r.evaluation}
                    onChange={(e) => change(r.key, { evaluation: e.target.value })}
                    maxLength={MAX_TNI_EVALUATION}
                    className="input"
                    autoComplete="off"
                    placeholder="How you will know it worked"
                  />
                </div>
                <button
                  type="button"
                  className="btn btn-icon btn-bad mb-0.5 shrink-0"
                  aria-label={`Remove row ${n + 1}`}
                  title="Remove this row"
                  onClick={() => setRows((all) => all.filter((x) => x.key !== r.key))}
                >
                  <Trash2 size={14} aria-hidden />
                </button>
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
          {rows.length < MAX_TNI_ROWS ? (
            <button type="button" className="btn btn-sm" onClick={() => setRows((all) => [...all, blankRow()])}>
              <Plus size={14} aria-hidden /> Add row
            </button>
          ) : (
            <span className="text-xs text-ink-3">A TNI holds at most {MAX_TNI_ROWS} rows.</span>
          )}
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-2 border-t border-rule pt-5">
        <SubmitButton pending={pending} pendingLabel="Saving…">
          Save
        </SubmitButton>
        <Link href={cancelHref} className="btn btn-ghost">
          Cancel
        </Link>
        <span className="text-xs text-ink-3">Saving puts the list on record, so every row needs all of its parts. You can change it until the year ends.</span>
      </div>
    </form>
  );
}
