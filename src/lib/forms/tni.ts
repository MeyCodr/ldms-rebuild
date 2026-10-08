// The TNI form: one list per department per year. A row is a performance
// indicator, the expected and actual performance, what may be causing the
// gap, whether it is a matter of attitude, skill or knowledge, the L&D method
// and how the result will be evaluated. The old system's form
// (staff/hod/tni/tni.php), whose one heading is "Mandatory (within the first
// 3 months in the role)".
// No database or server code here, so the form and the server check the same way.

import { TNA_METHODS, type TnaMethodKey } from "./tna";

export const TNI_HEADING = "Mandatory (within the first 3 months in the role)";

export const MAX_TNI_ROWS = 50;
export const MAX_TNI_INDICATOR = 1000;
export const MAX_TNI_CAUSES = 500;
export const MAX_TNI_ASK = 255;
export const MAX_TNI_EVALUATION = 255;

export type TniRow = {
  indicator: string;
  /** Expected and actual performance, 1 to 5: the TNA's skill levels. */
  expected: number | null;
  actual: number | null;
  causes: string;
  /** Attitude, skill or knowledge. */
  ask: string;
  method: TnaMethodKey | null;
  evaluation: string;
};
export type TniContent = TniRow[];

/** A problem with the content: about the whole list, or a row (its position in the content). */
export type TniProblem = { at: "form" | { row: number }; message: string };

const level = (v: unknown): v is number | null => v === null || (Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 5);
const tidy = (s: string) => s.trim().replace(/[ \t]+/g, " ");

/**
 * Reads the form's content (JSON) and tidies it: text trimmed, rows left
 * completely blank dropped. Null when it isn't the form's shape at all.
 */
export function parseTniContent(json: string): TniContent | null {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return null;
  }
  if (!Array.isArray(raw)) return null;
  const rows: TniContent = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") return null;
    const { indicator, expected, actual, causes, ask, method, evaluation } = r as Record<string, unknown>;
    if (typeof indicator !== "string" || typeof causes !== "string" || typeof ask !== "string" || typeof evaluation !== "string") return null;
    if (!level(expected) || !level(actual)) return null;
    if (!(method === null || TNA_METHODS.includes(method as TnaMethodKey))) return null;
    const row: TniRow = { indicator: tidy(indicator), expected, actual, causes: tidy(causes), ask: tidy(ask), method: method as TnaMethodKey | null, evaluation: tidy(evaluation) };
    const blank = !row.indicator && row.expected === null && row.actual === null && !row.causes && !row.ask && row.method === null && !row.evaluation;
    if (!blank) rows.push(row);
  }
  return rows;
}

/**
 * What is wrong with a TNI's content. There are no drafts: what is saved is
 * the record, so there must be at least one row and every row needs all of
 * its parts.
 */
export function tniContentProblems(content: TniContent): TniProblem[] {
  if (content.length === 0) return [{ at: "form", message: "Add at least one performance indicator before saving." }];
  const problems: TniProblem[] = [];
  if (content.length > MAX_TNI_ROWS) problems.push({ at: "form", message: `At most ${MAX_TNI_ROWS} rows.` });
  content.forEach((r, row) => {
    const say = (message: string) => problems.push({ at: { row }, message });
    const missing = [
      !r.indicator && "the performance indicator",
      r.expected === null && "the expected performance",
      r.actual === null && "the actual performance",
      !r.causes && "the possible causes",
      !r.ask && "attitude, skill or knowledge",
      r.method === null && "the L&D method",
      !r.evaluation && "the evaluation method",
    ].filter((m): m is string => !!m);
    if (missing.length) say(`Fill in ${missing.length > 1 ? `${missing.slice(0, -1).join(", ")} and ${missing.at(-1)}` : missing[0]}.`);
    if (r.indicator.length > MAX_TNI_INDICATOR) say(`Keep the performance indicator under ${MAX_TNI_INDICATOR} characters.`);
    if (r.causes.length > MAX_TNI_CAUSES) say(`Keep the possible causes under ${MAX_TNI_CAUSES} characters.`);
    if (r.ask.length > MAX_TNI_ASK) say(`Keep attitude, skill or knowledge under ${MAX_TNI_ASK} characters.`);
    if (r.evaluation.length > MAX_TNI_EVALUATION) say(`Keep the evaluation method under ${MAX_TNI_EVALUATION} characters.`);
  });
  return problems;
}
