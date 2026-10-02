import { z } from "zod";
import { dayNumber, MAX_CONSECUTIVE_DAYS } from "@/server/rules/training";
import { OJT_METHODS, OJT_TRAINER_PROGRAM, OJT_TRAINERS } from "./training";

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const date = z.union([z.literal(""), z.iso.date("Enter a date as DD/MM/YYYY")]);
const time = z.union([z.literal(""), z.string().regex(TIME, "Enter a time as HH:MM, e.g. 08:30")]);
const inRange = (v: string) => v >= "2000-01-01" && v <= "2099-12-31";

/**
 * An OJT a staff member records for themselves: Section A of the old
 * system's OJT form. (Section B, the evaluation, is checked by the OJT form.)
 */
export const ojtSchema = z
  .object({
    title: z.string().trim().min(3, "Enter the title").max(200, "At most 200 characters"),
    ojtMethod: z.enum(OJT_METHODS, "Choose the training type"),
    startDate: date,
    endDate: date,
    startTime: time,
    endTime: time,
    venue: z.string().trim().min(1, "Enter the venue").max(160, "At most 160 characters"),
    trainer: z.enum(OJT_TRAINERS, "Choose external or internal"),
  })
  // Runs even when a field above failed, so every missing field is flagged at once.
  .superRefine(
    (v, ctx) => {
      const issue = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
      if (!v.startDate) issue("startDate", "Enter the start date");
      else if (!inRange(v.startDate)) issue("startDate", "Must be between 2000 and 2099");
      if (!v.endDate) issue("endDate", "Enter the end date");
      if (v.startDate && v.endDate) {
        const days = dayNumber(v.endDate)! - dayNumber(v.startDate)! + 1;
        if (days < 1) issue("endDate", "The end date can't be before the start date");
        else if (days > MAX_CONSECUTIVE_DAYS) issue("endDate", `That is ${days} days. An OJT can run for at most ${MAX_CONSECUTIVE_DAYS} days.`);
      }
      if (!v.startTime) issue("startTime", "Enter the start time");
      if (!v.endTime) issue("endTime", "Enter the end time");
      if (v.startTime && v.endTime && v.endTime <= v.startTime) issue("endTime", "Must be after the start time");
    },
    { when: () => true },
  )
  .transform((v) => ({
    title: v.title,
    ojtMethod: v.ojtMethod,
    startDate: new Date(`${v.startDate}T00:00:00Z`),
    endDate: new Date(`${v.endDate}T00:00:00Z`),
    startTime: new Date(`1970-01-01T${v.startTime}:00Z`),
    endTime: new Date(`1970-01-01T${v.endTime}:00Z`),
    venue: v.venue,
    program: OJT_TRAINER_PROGRAM[v.trainer],
  }));

export type OjtInput = z.infer<typeof ojtSchema>;
