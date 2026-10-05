import type { ParticipantSource } from "@prisma/client";
import type { OjtFilters, OjtListRow } from "@/server/services/ojt";

// The OJT list's filters in the URL, and its labels, shared by the page and
// its Excel export so both show the same rows the same way.

type Search = Record<string, string | string[] | undefined>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const isoDate = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) ? v : undefined);

/** Reads the filters from the URL, ignoring anything malformed. */
export function parseOjtFilters(sp: Search): OjtFilters {
  const departmentId = Number(one(sp.department));
  const page = Number(one(sp.page));
  return {
    q: one(sp.q).trim().slice(0, 80) || undefined,
    departmentId: Number.isInteger(departmentId) && departmentId > 0 ? departmentId : undefined,
    from: isoDate(one(sp.from)),
    to: isoDate(one(sp.to)),
    page: Number.isInteger(page) && page > 0 ? page : 1,
  };
}

/** The filters as a query string ("" for none), optionally for another page. */
export function ojtFiltersToQuery(f: OjtFilters, page?: number): string {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.departmentId) p.set("department", String(f.departmentId));
  if (f.from) p.set("from", f.from);
  if (f.to) p.set("to", f.to);
  if (page && page > 1) p.set("page", String(page));
  const s = p.toString();
  return s ? `?${s}` : "";
}

/** How the OJT reached the person's record. */
export const SOURCE_LABELS: Record<ParticipantSource, string> = {
  CLERK: "Clerk",
  IMPORT: "Excel import",
  ADMIN: "L&D",
  SELF: "Staff member",
};

export function ojtStatus(r: Pick<OjtListRow, "attendance" | "training">): { tone: "ok" | "wait" | "bad" | "na"; label: string } {
  if (r.training.status === "CANCELLED") return { tone: "bad", label: "Cancelled" };
  if (r.attendance === "COMPLETED") return { tone: "ok", label: "Completed" };
  if (r.attendance === "ABSENT") return { tone: "na", label: "Absent" };
  return { tone: "wait", label: "Answers due" };
}
