import type { Attendance, TrainingType } from "@prisma/client";
import { TRAINING_TYPES } from "@/lib/validation/training";
import type { ReportFilters } from "@/server/services/report";

type Search = Record<string, string | string[] | undefined>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
/** A YYYY-MM-DD date, or undefined when it's missing or not a real date. */
function day(v: string): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return undefined;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(v) ? v : undefined;
}
const id = (v: string) => (/^\d{1,9}$/.test(v) && Number(v) > 0 ? Number(v) : undefined);

/** Reads the reports' filters from the URL, ignoring anything malformed. */
export function parseReportFilters(sp: Search): ReportFilters {
  const type = one(sp.type);
  const page = Number(one(sp.page));
  const show = one(sp.show);
  return {
    q: one(sp.q).trim().slice(0, 80) || undefined,
    from: day(one(sp.from)),
    to: day(one(sp.to)),
    divisionId: id(one(sp.division)),
    departmentId: id(one(sp.department)),
    type: (TRAINING_TYPES as readonly string[]).includes(type) ? (type as TrainingType) : undefined,
    show: show === "trained" || show === "untrained" ? show : undefined,
    page: Number.isInteger(page) && page > 0 ? page : 1,
  };
}

/** The filters as a query string ("" when there are none). `keep` limits it to some of them, e.g. just the period. */
export function reportQuery(f: ReportFilters, overrides: Partial<ReportFilters> = {}, keep?: (keyof ReportFilters)[]): string {
  const merged = { ...f, ...overrides };
  const has = (k: keyof ReportFilters) => !keep || keep.includes(k);
  const params = new URLSearchParams();
  if (merged.q && has("q")) params.set("q", merged.q);
  if (merged.type && has("type")) params.set("type", merged.type);
  if (merged.divisionId && has("divisionId")) params.set("division", String(merged.divisionId));
  if (merged.departmentId && has("departmentId")) params.set("department", String(merged.departmentId));
  if (merged.show && has("show")) params.set("show", merged.show);
  if (merged.from && has("from")) params.set("from", merged.from);
  if (merged.to && has("to")) params.set("to", merged.to);
  if (merged.page && merged.page > 1 && has("page")) params.set("page", String(merged.page));
  const s = params.toString();
  return s ? `?${s}` : "";
}

/** The four reports, in the order of their tabs. */
export const REPORTS = [
  { key: "staff-hours", label: "Staff hours", blurb: "Each person's completed trainings and hours" },
  { key: "department-hours", label: "Department hours", blurb: "Headcount, hours and the average per head" },
  { key: "attendance", label: "Training attendance", blurb: "How each training's participants did" },
  { key: "audit", label: "Audit report", blurb: "One line per person per training, for audits" },
] as const;
export type ReportKey = (typeof REPORTS)[number]["key"];

export const ATTENDANCE_TONE: Record<Attendance, "ok" | "wait" | "na"> = { COMPLETED: "ok", PENDING: "wait", ABSENT: "na" };
