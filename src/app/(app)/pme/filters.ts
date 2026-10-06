import { PME_STAGES, type PmeStage } from "@/server/rules/pme";
import type { PmeFilters } from "@/server/services/pme";

type Search = Record<string, string | string[] | undefined>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
/** A YYYY-MM-DD date, or undefined when it's missing or not a real date. */
function day(v: string): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return undefined;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(v) ? v : undefined;
}

/** Reads the PME list's filters from the URL, ignoring anything malformed. */
export function parsePmeFilters(sp: Search): PmeFilters {
  const stage = one(sp.stage);
  const department = one(sp.department);
  const page = Number(one(sp.page));
  return {
    q: one(sp.q).trim().slice(0, 80) || undefined,
    stage: (PME_STAGES as readonly string[]).includes(stage) ? (stage as PmeStage) : undefined,
    departmentId: /^\d{1,9}$/.test(department) && Number(department) > 0 ? Number(department) : undefined,
    from: day(one(sp.from)),
    to: day(one(sp.to)),
    page: Number.isInteger(page) && page > 0 ? page : 1,
  };
}

/** The filters as a query string ("" when there are none). */
export function pmeQuery(f: PmeFilters, overrides: Partial<PmeFilters> = {}): string {
  const merged = { ...f, ...overrides };
  const params = new URLSearchParams();
  if (merged.q) params.set("q", merged.q);
  if (merged.stage) params.set("stage", merged.stage);
  if (merged.departmentId) params.set("department", String(merged.departmentId));
  if (merged.from) params.set("from", merged.from);
  if (merged.to) params.set("to", merged.to);
  if (merged.page && merged.page > 1) params.set("page", String(merged.page));
  const s = params.toString();
  return s ? `?${s}` : "";
}
