import { z } from "zod";
import { ojtDetailsChecks, ojtDetailsFields, toOjtDetails } from "./myTraining";

/**
 * An OJT a clerk or L&D records for several staff at once: the OJT form's
 * Section A, the trainer's name (as in the Excel template), and who attended.
 */
export const ojtEntrySchema = ojtDetailsFields
  .extend({
    trainerName: z.string().trim().min(1, "Enter the trainer's name").max(160, "At most 160 characters"),
    staffIds: z.array(z.coerce.number().int().positive()).min(1, "Choose at least one staff member"),
  })
  .superRefine(ojtDetailsChecks, { when: () => true })
  .transform((v) => ({ details: { ...toOjtDetails(v), trainerName: v.trainerName }, staffIds: [...new Set(v.staffIds)] }));

export type OjtEntry = z.infer<typeof ojtEntrySchema>;
export type OjtEntryDetails = OjtEntry["details"];
