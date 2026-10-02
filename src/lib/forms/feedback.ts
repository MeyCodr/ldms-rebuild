import { z } from "zod";

// The forms staff fill in about their training, in one file so the wording can
// change without touching anything else. Answers are stored with the form's
// version (Participant.feedbackVersion), so a new version never changes how
// old answers read: add FEEDBACK_V2 beside V1 rather than editing V1 once used.
//
// Which form a training uses: OJT has its own short form (OJT_V1), every other
// training the course feedback form (FEEDBACK_V1).
//
// OJT_V1 is the old system's OJT evaluation, word for word (confirmed 1 Oct 2026).
// TODO(L&D): FEEDBACK_V1's wording is still a placeholder (phase 2 plan,
// question 1). Replace it with the old system's questions, then set
// `draft: false`. Keep the ids: the old q1–q16 columns import into q1–q16.

/** The two 1–5 scales: agreement with a statement, and a rating of a level. */
export type ScaleKind = "agree" | "rating";

export type Question =
  | { id: string; kind: "scale"; scale: ScaleKind; text: string; required: boolean }
  | { id: string; kind: "yesno"; text: string; required: boolean }
  | { id: string; kind: "text"; text: string; required: boolean; hint?: string };

export type FormDefinition = {
  version: number;
  /** Placeholder wording waiting for L&D: the form says so on screen. */
  draft: boolean;
  /** `intro` is shown under a section's title, e.g. to explain its scale. */
  sections: { title: string; intro?: string; questions: Question[] }[];
};

/** Each 1–5 scale, lowest first. `hint` is shown under the label. */
export const SCALES: Record<ScaleKind, readonly { value: number; label: string; hint?: string }[]> = {
  agree: [
    { value: 1, label: "Strongly disagree" },
    { value: 2, label: "Disagree" },
    { value: 3, label: "Neutral" },
    { value: 4, label: "Agree" },
    { value: 5, label: "Strongly agree" },
  ],
  // The old OJT form's scale: 5 Excellent > 90% … 1 Poor < 49%.
  rating: [
    { value: 1, label: "Poor", hint: "below 50%" },
    { value: 2, label: "Fair", hint: "50–69%" },
    { value: 3, label: "Average", hint: "70–79%" },
    { value: 4, label: "Good", hint: "80–89%" },
    { value: 5, label: "Excellent", hint: "90% and above" },
  ],
};

export const YES_NO = [
  { value: "YES", label: "Yes" },
  { value: "NO", label: "No" },
] as const;

/** Longest answer to a written question. */
export const MAX_ANSWER = 1000;

const scale = (id: string, text: string, kind: ScaleKind = "agree"): Question => ({ id, kind: "scale", scale: kind, text, required: true });

/** Course feedback: 16 questions, filled in from the training's last day. */
export const FEEDBACK_V1: FormDefinition = {
  version: 1,
  draft: true,
  sections: [
    {
      title: "The course",
      questions: [
        scale("q1", "The objectives of the training were explained clearly."),
        scale("q2", "The content was relevant to my job."),
        scale("q3", "The material was well organised and easy to follow."),
        scale("q4", "The length of the training was right for the content."),
      ],
    },
    {
      title: "The trainer",
      questions: [
        scale("q5", "The trainer knew the subject well."),
        scale("q6", "The trainer explained things clearly."),
        scale("q7", "The trainer encouraged questions and took part with us."),
        scale("q8", "The trainer kept to the schedule."),
      ],
    },
    {
      title: "Arrangements",
      questions: [scale("q9", "The venue or online platform was suitable."), scale("q10", "The training materials and equipment were adequate.")],
    },
    {
      title: "What you got out of it",
      questions: [
        scale("q11", "I gained new knowledge or skills."),
        scale("q12", "I can apply what I learned in my job."),
        scale("q13", "Overall, I am satisfied with this training."),
        { id: "q14", kind: "yesno", text: "Would you recommend this training to colleagues?", required: true },
      ],
    },
    {
      title: "Comments",
      questions: [
        { id: "q15", kind: "text", text: "What was most useful?", required: false },
        { id: "q16", kind: "text", text: "How could the training be improved?", required: false },
      ],
    },
  ],
};

/** OJT: Section B of the old system's OJT form, given when the OJT is recorded or completed. */
export const OJT_V1: FormDefinition = {
  version: 1,
  draft: false,
  sections: [
    {
      title: "Training evaluation",
      questions: [{ id: "a1", kind: "text", text: "Please highlight what you have learned from the OJT", required: true }],
    },
    {
      title: "Pre & post evaluation",
      intro: "Please assess the training program using the scale below.",
      questions: [
        scale("a2", "Your knowledge / skill before training (Pengetahuan/kemahiran sebelum training)", "rating"),
        scale("a3", "Your knowledge / skill after training (Pengetahuan/kemahiran selepas latihan)", "rating"),
      ],
    },
  ],
};

export type FormKind = "FEEDBACK" | "OJT";

/** The form used for new answers, per kind. */
export const CURRENT_FORM: Record<FormKind, FormDefinition> = { FEEDBACK: FEEDBACK_V1, OJT: OJT_V1 };

/** Every version, to read answers stored under an older one. */
const VERSIONS: Record<FormKind, Record<number, FormDefinition>> = {
  FEEDBACK: { 1: FEEDBACK_V1 },
  OJT: { 1: OJT_V1 },
};

export function formVersion(kind: FormKind, version: number | null | undefined): FormDefinition | null {
  return version ? (VERSIONS[kind][version] ?? null) : null;
}

export const questionsOf = (form: FormDefinition) => form.sections.flatMap((s) => s.questions);

export type Answers = Record<string, number | string | null>;

const CHOOSE = "Choose an answer";

/**
 * Checks a form's answers, as submitted (every value a string), and turns them
 * into what is stored: scale answers as 1–5, yes/no as YES or NO, written
 * answers trimmed (empty ones as null).
 */
export function answersSchema(form: FormDefinition) {
  const shape: Record<string, z.ZodType> = {};
  for (const q of questionsOf(form)) {
    if (q.kind === "scale") {
      const value = z.enum(["1", "2", "3", "4", "5"], CHOOSE).transform(Number);
      shape[q.id] = q.required ? value : z.union([z.literal("").transform(() => null), value]);
    } else if (q.kind === "yesno") {
      const value = z.enum(["YES", "NO"], CHOOSE);
      shape[q.id] = q.required ? value : z.union([z.literal("").transform(() => null), value]);
    } else {
      const value = z.string("Write an answer").trim().max(MAX_ANSWER, `Keep it under ${MAX_ANSWER} characters`);
      shape[q.id] = q.required ? value.min(1, "Write an answer") : value.transform((v) => v || null);
    }
  }
  return z.object(shape) as unknown as z.ZodType<Answers>;
}

/** An answer as words, for showing what someone gave. */
export function answerLabel(q: Question, value: Answers[string] | undefined): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (q.kind === "scale") {
    const s = SCALES[q.scale].find((s) => s.value === value);
    // A rating reads with its number, as on the old form: "4 · Good".
    return s ? (q.scale === "rating" ? `${s.value} · ${s.label}` : s.label) : String(value);
  }
  if (q.kind === "yesno") return YES_NO.find((s) => s.value === value)?.label ?? String(value);
  return String(value);
}
