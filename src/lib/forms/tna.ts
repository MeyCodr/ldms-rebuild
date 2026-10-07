// The TNA form: seven sections, each a list of rows the person adds. A row is
// a problem statement, the training required (picked from that section's
// list, or "Others" typed in), the target and current skill, how it will be
// achieved and when. The old system's form (staff/office/tna/tna.php).
// No database or server code here, so the form and the server check the same way.

export const TNA_SECTIONS = ["ESG", "SOFT_SKILLS", "LEADERSHIP", "DATA_DRIVEN", "FUNCTIONAL", "DIGITAL", "SPECIAL_PROJECT"] as const;
export type TnaSectionKey = (typeof TNA_SECTIONS)[number];

export const TNA_SECTION_LABELS: Record<TnaSectionKey, string> = {
  ESG: "ESG",
  SOFT_SKILLS: "Soft skills",
  LEADERSHIP: "Leadership awareness",
  DATA_DRIVEN: "Data driven",
  FUNCTIONAL: "Functional awareness",
  DIGITAL: "Digital transformation and innovation",
  SPECIAL_PROJECT: "Special project",
};
/** What the old form says under each heading. Data driven has nothing there. */
export const TNA_SECTION_HINTS: Record<TnaSectionKey, string> = {
  ESG: "Environment, social and governance.",
  SOFT_SKILLS: "Individual development competencies, such as communication.",
  LEADERSHIP: "Nurturing talent and inspiring others towards excellence.",
  DATA_DRIVEN: "",
  FUNCTIONAL: "The knowledge and technical skills the job requires: critical priorities and future growth.",
  DIGITAL: "The company's digital objectives and what its growth will need.",
  SPECIAL_PROJECT: "A short-term project, functional or cross-functional.",
};
/** "a" to "g", as the form letters its sections. */
export const tnaSectionLetter = (section: TnaSectionKey) => String.fromCharCode(97 + TNA_SECTIONS.indexOf(section));
export const tnaSectionTitle = (section: TnaSectionKey) => `${tnaSectionLetter(section)}. ${TNA_SECTION_LABELS[section]}`;

/** Target and current skill, lowest first. */
export const TNA_LEVELS = [
  { value: 1, label: "Fundamental awareness", hint: "Basic knowledge" },
  { value: 2, label: "Novice", hint: "Little experience or competence in the skill" },
  { value: 3, label: "Intermediate", hint: "Some competence, but below the level required" },
  { value: 4, label: "Proficient", hint: "Competent and confident in the area" },
  { value: 5, label: "Expert", hint: "An expert in that skill" },
] as const;
export const tnaLevelLabel = (level: number) => TNA_LEVELS.find((l) => l.value === level)?.label ?? "";

export const TNA_METHODS = ["OJT", "COACHING", "EXTERNAL_INHOUSE"] as const;
export type TnaMethodKey = (typeof TNA_METHODS)[number];
export const TNA_METHOD_LABELS: Record<TnaMethodKey, string> = { OJT: "On-job training", COACHING: "Coaching", EXTERNAL_INHOUSE: "External / In-house" };

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
export const monthLabel = (month: number) => MONTHS[month - 1] ?? "";

export const MAX_TNA_ROWS = 20; // per section
export const MAX_TNA_PROBLEM = 1000;
export const MAX_TNA_TRAINING = 255;

/**
 * A row of the form. The training is an option (optionId) or "Others", typed
 * in (optionId null, trainingName what was typed). For an option, the server
 * fills trainingName in from the list.
 */
export type TnaRow = {
  section: TnaSectionKey;
  problem: string;
  optionId: number | null;
  trainingName: string;
  target: number | null;
  current: number | null;
  method: TnaMethodKey | null;
  month: number | null;
};
/** A TNA's content: its rows in order, each section's together. */
export type TnaContent = TnaRow[];

/** Target minus current: how far there is to go. Null until both are given. */
export function tnaGap(target: number | null, current: number | null): number | null {
  return target === null || current === null ? null : target - current;
}

/** A problem with the content: about the whole form, a section, or a row (its position in the content). */
export type TnaProblem = { at: "form" | { section: TnaSectionKey } | { row: number }; message: string };

const level = (v: unknown): v is number | null => v === null || (Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 5);

/**
 * Reads the form's content (JSON) and tidies it: text trimmed, rows left
 * completely blank dropped, sections put in order. Null when it isn't the
 * form's shape at all.
 */
export function parseTnaContent(json: string): TnaContent | null {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return null;
  }
  if (!Array.isArray(raw)) return null;
  const rows: TnaContent = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") return null;
    const { section, problem, optionId, trainingName, target, current, method, month } = r as Record<string, unknown>;
    if (!TNA_SECTIONS.includes(section as TnaSectionKey) || typeof problem !== "string" || typeof trainingName !== "string") return null;
    if (!(optionId === null || (Number.isInteger(optionId) && (optionId as number) > 0))) return null;
    if (!level(target) || !level(current)) return null;
    if (!(method === null || TNA_METHODS.includes(method as TnaMethodKey))) return null;
    if (!(month === null || (Number.isInteger(month) && (month as number) >= 1 && (month as number) <= 12))) return null;
    const row: TnaRow = {
      section: section as TnaSectionKey,
      problem: problem.trim(),
      optionId: optionId as number | null,
      // An option's name comes from the list, on the server; only "Others" is typed.
      trainingName: optionId === null ? trainingName.trim().replace(/\s+/g, " ") : "",
      target,
      current,
      method: method as TnaMethodKey | null,
      month: month as number | null,
    };
    const blank = !row.problem && row.optionId === null && !row.trainingName && row.target === null && row.current === null && row.method === null && row.month === null;
    if (!blank) rows.push(row);
  }
  return TNA_SECTIONS.flatMap((s) => rows.filter((r) => r.section === s));
}

/**
 * What is wrong with a TNA's content. A draft only has to be storable: it may
 * be unfinished. To submit, there must be at least one row, and every row
 * needs all of its parts.
 */
export function tnaContentProblems(content: TnaContent, mode: "draft" | "submit"): TnaProblem[] {
  if (content.length === 0) return [{ at: "form", message: "Add at least one training need before saving." }];
  const problems: TnaProblem[] = [];
  for (const section of TNA_SECTIONS)
    if (content.filter((r) => r.section === section).length > MAX_TNA_ROWS) problems.push({ at: { section }, message: `At most ${MAX_TNA_ROWS} rows in a section.` });
  content.forEach((r, row) => {
    const say = (message: string) => problems.push({ at: { row }, message });
    if (r.problem.length > MAX_TNA_PROBLEM) say(`Keep the problem statement under ${MAX_TNA_PROBLEM} characters.`);
    if (r.trainingName.length > MAX_TNA_TRAINING) say(`Keep the training's name under ${MAX_TNA_TRAINING} characters.`);
    if (mode === "submit") {
      const missing = [
        !r.problem && "the problem statement",
        r.optionId === null && !r.trainingName && "the training required",
        r.target === null && "the target skill",
        r.current === null && "the current skill",
        r.method === null && "how it will be achieved",
        r.month === null && "when",
      ].filter((m): m is string => !!m);
      if (missing.length) say(`Fill in ${missing.length > 1 ? `${missing.slice(0, -1).join(", ")} and ${missing.at(-1)}` : missing[0]}.`);
    }
  });
  return problems;
}

/**
 * A training option's or group's name as L&D's lists store it: capitals,
 * single spaces. Or why it can't be used.
 */
export function cleanOptionName(raw: string): { name: string; error: string | null } {
  const name = raw.replace(/\s+/g, " ").trim().toUpperCase();
  if (!name) return { name, error: "Give it a name" };
  if (name.length > MAX_TNA_TRAINING) return { name, error: `At most ${MAX_TNA_TRAINING} characters` };
  if (name === "OTHERS") return { name, error: "Others is on every list already" };
  return { name, error: null };
}
