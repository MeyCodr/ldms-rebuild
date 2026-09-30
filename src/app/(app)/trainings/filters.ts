import type { TrainingType } from "@prisma/client";
import { TRAINING_TYPES } from "@/lib/validation/training";
import { TRAINING_SORT_DEFAULT_DIR, TRAINING_SORTS, type TrainingFilters, type TrainingSort } from "@/server/services/training";

type Search = Record<string, string | string[] | undefined>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/** Reads list filters from the URL, ignoring anything malformed. */
export function parseTrainingFilters(sp: Search): TrainingFilters {
  const type = one(sp.type);
  const status = one(sp.status);
  const year = Number(one(sp.year));
  const sortParam = one(sp.sort);
  const sort: TrainingSort = (TRAINING_SORTS as readonly string[]).includes(sortParam) ? (sortParam as TrainingSort) : "date";
  const dir = one(sp.dir);
  const page = Number(one(sp.page));
  return {
    q: one(sp.q).slice(0, 80) || undefined,
    type: (TRAINING_TYPES as readonly string[]).includes(type) ? (type as TrainingType) : undefined,
    year: Number.isInteger(year) && year >= 2000 && year <= 2099 ? year : undefined,
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
  if (merged.year) params.set("year", String(merged.year));
  if (merged.status && merged.status !== "ALL") params.set("status", merged.status);
  if (sort !== "date") params.set("sort", sort);
  if (merged.dir && merged.dir !== TRAINING_SORT_DEFAULT_DIR[sort]) params.set("dir", merged.dir);
  if (merged.page && merged.page > 1) params.set("page", String(merged.page));
  const s = params.toString();
  return s ? `?${s}` : "";
}
