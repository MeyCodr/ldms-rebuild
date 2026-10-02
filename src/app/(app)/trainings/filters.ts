import type { TrainingType } from "@prisma/client";
import { TRAINING_TYPES } from "@/lib/validation/training";
import { TRAINING_SORT_DEFAULT_DIR, TRAINING_SORTS, type TrainingFilters, type TrainingSort } from "@/server/services/training";

type Search = Record<string, string | string[] | undefined>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
/** A YYYY-MM-DD date, or undefined when it's missing or not a real date. */
function day(v: string): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return undefined;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(v) ? v : undefined;
}

/** Reads list filters from the URL, ignoring anything malformed. */
export function parseTrainingFilters(sp: Search): TrainingFilters {
  const type = one(sp.type);
  const status = one(sp.status);
  const sortParam = one(sp.sort);
  const sort: TrainingSort = (TRAINING_SORTS as readonly string[]).includes(sortParam) ? (sortParam as TrainingSort) : "date";
  const dir = one(sp.dir);
  const page = Number(one(sp.page));
  return {
    q: one(sp.q).slice(0, 80) || undefined,
    type: (TRAINING_TYPES as readonly string[]).includes(type) ? (type as TrainingType) : undefined,
    from: day(one(sp.from)),
    to: day(one(sp.to)),
    status: status === "SCHEDULED" || status === "CANCELLED" ? status : "ALL",
    sort,
    dir: dir === "asc" || dir === "desc" ? dir : TRAINING_SORT_DEFAULT_DIR[sort],
    page: Number.isInteger(page) && page > 0 ? page : 1,
  };
}

export function filtersToQuery(f: TrainingFilters, overrides: Partial<TrainingFilters> = {}): string {
  const merged = { ...f, ...overrides };
  const sort = merged.sort ?? "date";
  const params = new URLSearchParams();
  if (merged.q) params.set("q", merged.q);
  if (merged.type) params.set("type", merged.type);
  if (merged.from) params.set("from", merged.from);
  if (merged.to) params.set("to", merged.to);
  if (merged.status && merged.status !== "ALL") params.set("status", merged.status);
  if (sort !== "date") params.set("sort", sort);
  if (merged.dir && merged.dir !== TRAINING_SORT_DEFAULT_DIR[sort]) params.set("dir", merged.dir);
  if (merged.page && merged.page > 1) params.set("page", String(merged.page));
  const s = params.toString();
  return s ? `?${s}` : "";
}
