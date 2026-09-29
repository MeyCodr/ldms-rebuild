import type { Designation } from "@prisma/client";
import { DESIGNATIONS } from "@/lib/validation/staff";
import { STAFF_FLAGS, type StaffFilters, type StaffFlag } from "@/server/services/staff";

type Search = Record<string, string | string[] | undefined>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/** Reads list filters from the URL, ignoring anything malformed. */
export function parseStaffFilters(sp: Search): StaffFilters {
  const departmentId = Number(one(sp.departmentId));
  const designation = one(sp.designation);
  const status = one(sp.status);
  const flag = one(sp.flag);
  const sort = one(sp.sort);
  const page = Number(one(sp.page));
  return {
    q: one(sp.q).slice(0, 80) || undefined,
    departmentId: Number.isInteger(departmentId) && departmentId > 0 ? departmentId : undefined,
    designation: (DESIGNATIONS as readonly string[]).includes(designation) ? (designation as Designation) : undefined,
    status: status === "RESIGNED" || status === "ALL" ? status : "ACTIVE",
    flag: flag in STAFF_FLAGS ? (flag as StaffFlag) : undefined,
    sort: sort === "name" || sort === "department" || sort === "dateJoined" ? sort : "staffNo",
    dir: one(sp.dir) === "desc" ? "desc" : "asc",
    page: Number.isInteger(page) && page > 0 ? page : 1,
  };
}

export function filtersToQuery(f: StaffFilters, overrides: Partial<StaffFilters> = {}): string {
  const merged = { ...f, ...overrides };
  const params = new URLSearchParams();
  if (merged.q) params.set("q", merged.q);
  if (merged.departmentId) params.set("departmentId", String(merged.departmentId));
  if (merged.designation) params.set("designation", merged.designation);
  if (merged.status && merged.status !== "ACTIVE") params.set("status", merged.status);
  if (merged.flag) params.set("flag", merged.flag);
  if (merged.sort && merged.sort !== "staffNo") params.set("sort", merged.sort);
  if (merged.dir === "desc") params.set("dir", "desc");
  if (merged.page && merged.page > 1) params.set("page", String(merged.page));
  const s = params.toString();
  return s ? `?${s}` : "";
}
