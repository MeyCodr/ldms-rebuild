import { z } from "zod";
import { dayNumber, MAX_CONSECUTIVE_DAYS, usesInternalTrainer } from "@/server/rules/training";

export const TRAINING_TYPES = ["PUBLIC_INHOUSE", "OJT", "DEPARTMENTAL"] as const;
export type TrainingTypeCode = (typeof TRAINING_TYPES)[number];

export const TRAINING_TYPE_LABELS: Record<TrainingTypeCode, string> = {
  PUBLIC_INHOUSE: "Public / In-house",
  OJT: "OJT",
  DEPARTMENTAL: "Departmental",
};

/** Shorter labels for tight spaces such as the trainings table. */
export const TRAINING_TYPE_SHORT_LABELS: Record<TrainingTypeCode, string> = {
  PUBLIC_INHOUSE: "Public",
  OJT: "OJT",
  DEPARTMENTAL: "Departmental",
};

export const TRAINING_TYPE_HINTS: Record<TrainingTypeCode, string> = {
  PUBLIC_INHOUSE: "A course run by an external provider, either at their venue or at PHN.",
  OJT: "On-the-job training at the workplace.",
  DEPARTMENTAL: "Run by a department for its own staff.",
};

export const TRAINING_PROGRAMS = ["EXTERNAL_PUBLIC", "INTERNAL_EXTERNAL_TRAINER", "INTERNAL_INTERNAL_TRAINER"] as const;
export const TRAINING_PROGRAM_LABELS: Record<(typeof TRAINING_PROGRAMS)[number], string> = {
  EXTERNAL_PUBLIC: "External public program",
  INTERNAL_EXTERNAL_TRAINER: "Internal training by external trainer",
  INTERNAL_INTERNAL_TRAINER: "Internal training by internal trainer",
};

export const TRAINING_FUNCTIONS = ["BUSINESS", "DIGITAL", "LEADERSHIP", "PERSONAL_EFFECTIVENESS"] as const;
export const TRAINING_FUNCTION_LABELS: Record<(typeof TRAINING_FUNCTIONS)[number], string> = {
  BUSINESS: "Business",
  DIGITAL: "Digital",
  LEADERSHIP: "Leadership",
  PERSONAL_EFFECTIVENESS: "Personal effectiveness",
};

export const TRAINING_PLATFORMS = ["PHYSICAL", "ONLINE"] as const;
export const TRAINING_PLATFORM_LABELS: Record<(typeof TRAINING_PLATFORMS)[number], string> = {
  PHYSICAL: "Physical",
  ONLINE: "Online",
};

/** How an OJT is given: "Training Type" on the old system's OJT form. */
export const OJT_METHODS = ["OJT", "COACHING", "MENTORING"] as const;
export const OJT_METHOD_LABELS: Record<(typeof OJT_METHODS)[number], string> = {
  OJT: "OJT",
  COACHING: "Coaching / Coachee",
  MENTORING: "Mentor / Mentee",
};

/**
 * An OJT's trainer is external or internal. It is stored as the training's
 * program, since OJT is always internal training: by an external trainer or by
 * an internal one.
 */
export const OJT_TRAINERS = ["EXTERNAL", "INTERNAL"] as const;
export type OjtTrainer = (typeof OJT_TRAINERS)[number];
export const OJT_TRAINER_LABELS: Record<OjtTrainer, string> = { EXTERNAL: "External", INTERNAL: "Internal" };
export const OJT_TRAINER_PROGRAM = { EXTERNAL: "INTERNAL_EXTERNAL_TRAINER", INTERNAL: "INTERNAL_INTERNAL_TRAINER" } as const;
export const ojtTrainerOf = (program: string | null | undefined): OjtTrainer | null =>
  program === "INTERNAL_EXTERNAL_TRAINER" ? "EXTERNAL" : program === "INTERNAL_INTERNAL_TRAINER" ? "INTERNAL" : null;

/** Program, function and platform are required on the form, except for OJT. */
export const needsClassification = (type: string) => type !== "OJT";

const optionalEnum = <T extends readonly [string, ...string[]]>(values: T) => z.union([z.literal(""), z.enum(values)]).transform((v) => (v === "" ? null : v));

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `At most ${max} characters`)
    .transform((v) => v || null);

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const optionalTime = z.union([z.literal(""), z.string().regex(TIME, "Enter a time as HH:MM, e.g. 08:30")]);
const optionalDate = z.union([z.literal(""), z.iso.date("Enter a date as DD/MM/YYYY")]);

const toDate = (v: string) => new Date(`${v}T00:00:00Z`);
const toTime = (v: string) => new Date(`1970-01-01T${v}:00Z`);

const inRange = (v: string) => v >= "2000-01-01" && v <= "2099-12-31";

/**
 * The Add/Edit Training form. It shows the same fields as the old system's
 * form (title, venue, cost, HRDC, platform, function, dates, times, program),
 * after the type, plus the trainer: picked from the staff list for an
 * internal trainer, typed otherwise.
 */
export const trainingSchema = z
  .object({
    type: z.enum(TRAINING_TYPES, "Choose a type"),
    title: z.string().trim().min(3, "Enter the training title").max(200, "At most 200 characters"),
    venue: text(160),
    cost: z
      .string()
      .trim()
      .transform((v) => v.replace(/^RM\s*/i, "").replace(/,/g, ""))
      .refine((v) => v === "" || /^\d{1,10}(\.\d{1,2})?$/.test(v), "Enter an amount in RM, e.g. 1200 or 1,250.50")
      .transform((v) => (v === "" ? null : Number(v).toFixed(2))),
    hrdfClaimable: z.enum(["yes", "no"], "Choose Yes or No").transform((v) => v === "yes"),
    platform: optionalEnum(TRAINING_PLATFORMS),
    function: optionalEnum(TRAINING_FUNCTIONS),
    startDate: optionalDate,
    endDate: optionalDate,
    startTime: optionalTime,
    endTime: optionalTime,
    program: optionalEnum(TRAINING_PROGRAMS),
    trainerStaffId: z.union([z.literal(""), z.coerce.number().int().positive()]).transform((v) => (v === "" ? null : v)),
    trainerName: text(160),
  })
  // Runs even when a field above failed (e.g. HRDC not chosen), so every
  // missing field is flagged in one go rather than one round at a time.
  .superRefine(
    (v, ctx) => {
      const issue = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });

      if (needsClassification(v.type)) {
        if (!v.program) issue("program", "Choose the program");
        if (!v.function) issue("function", "Choose the function");
        if (!v.platform) issue("platform", "Choose physical or online");
      }

      if (!v.startDate) issue("startDate", "Enter the start date");
      if (!v.endDate) issue("endDate", "Enter the end date");
      if (!v.startTime) issue("startTime", "Enter the start time");
      if (!v.endTime) issue("endTime", "Enter the end time");
      if (v.startDate && !inRange(v.startDate)) issue("startDate", "Must be between 2000 and 2099");
      if (v.startDate && v.endDate) {
        const days = dayNumber(v.endDate)! - dayNumber(v.startDate)! + 1;
        if (days < 1) issue("endDate", "The end date can't be before the start date");
        else if (days > MAX_CONSECUTIVE_DAYS) issue("endDate", `That is ${days} days. A training can run for at most ${MAX_CONSECUTIVE_DAYS} days.`);
      }
      if (v.startTime && v.endTime && v.endTime <= v.startTime) issue("endTime", "Must be after the start time (training can't run overnight)");
    },
    { when: () => true },
  )
  .transform((v) => ({
    type: v.type,
    title: v.title,
    venue: v.venue,
    cost: v.cost,
    hrdfClaimable: v.hrdfClaimable,
    platform: v.platform,
    function: v.function,
    startDate: toDate(v.startDate),
    endDate: toDate(v.endDate),
    startTime: toTime(v.startTime),
    endTime: toTime(v.endTime),
    program: v.program,
    // An internal trainer is picked from the staff list (the service copies
    // their name); for every other program the name is typed.
    trainerStaffId: usesInternalTrainer(v.program) ? v.trainerStaffId : null,
    trainerName: usesInternalTrainer(v.program) ? null : v.trainerName,
  }));

export type TrainingInput = z.infer<typeof trainingSchema>;
