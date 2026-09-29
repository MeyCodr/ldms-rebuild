import { z } from "zod";

const name = z.string().trim().min(2, "At least 2 characters").max(120, "At most 120 characters");
const shortName = z
  .string()
  .trim()
  .max(20, "At most 20 characters")
  .transform((s) => (s ? s.toUpperCase() : null));
const id = z.coerce.number().int().positive();
const optionalId = z
  .union([z.literal(""), z.coerce.number().int().positive()])
  .transform((v) => (v === "" ? null : v));

export const divisionSchema = z.object({ name, shortName });
export const departmentSchema = z.object({ name, shortName, divisionId: id });
export const sectionSchema = z.object({ name, departmentId: id });
export const assignHeadSchema = z.object({ staffId: optionalId });
export const transferSchema = z.object({
  staffIds: z.array(id).min(1, "Select at least one staff member"),
  departmentId: id,
  sectionId: optionalId,
});
