import type { Metadata } from "next";
import Link from "next/link";
import { forbidden } from "next/navigation";
import { ArrowRight, Grid3x3, Plus } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { ClickableRow } from "@/components/ui/ClickableRow";
import { Select } from "@/components/ui/Select";
import { Status } from "@/components/ui/Status";
import { withBasePath } from "@/lib/base-path";
import { formatDate, nowInMalaysia, plural } from "@/lib/format";
import { DESIGNATION_LABELS } from "@/lib/validation/staff";
import {
  fillsInSkillMatrices,
  parseQuarter,
  quarterLabel,
  quarterMonths,
  quarterParam,
  sameQuarter,
  seesSkillMatrices,
  SKILL_STAGE_LABELS,
  SKILL_STAGE_TONE,
  SKILL_STAGES,
  skillOpenQuarter,
  skillQuarterBlock,
  skillQuarterCloses,
  type SkillStage,
} from "@/server/rules/skill";
import { SKILL_PAGE_SIZE, skillDepartments, skillList, skillQuarters, skillStageCounts, type SkillFilters } from "@/server/services/skill";
import { requireUser } from "@/server/session";
import { ApproveSkillDialog } from "./SkillActions";

export const metadata: Metadata = { title: "Skill matrix" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function SkillMatrixPage({ searchParams }: PageProps<"/skill-matrix">) {
  const user = await requireUser();
  if (!seesSkillMatrices(user)) forbidden();
  const today = nowInMalaysia();
  const sp = await searchParams;
  const open = skillOpenQuarter(today);
  const quarter = parseQuarter(one(sp.quarter)) ?? open;
  const isOpen = sameQuarter(quarter, open);
  const stage = one(sp.stage);
  const department = one(sp.department);
  const page = Number(one(sp.page));
  const f: SkillFilters = {
    q: one(sp.q).trim().slice(0, 80) || undefined,
    stage: (SKILL_STAGES as readonly string[]).includes(stage) ? (stage as SkillStage) : undefined,
    departmentId: /^\d{1,9}$/.test(department) && Number(department) > 0 ? Number(department) : undefined,
    page: Number.isInteger(page) && page > 0 ? page : 1,
  };

  const [{ rows, total, page: at, pages }, counts, departments, quarters] = await Promise.all([
    skillList(user, quarter, f, today),
    skillStageCounts(user, quarter, f.departmentId),
    skillDepartments(user),
    skillQuarters(user, today),
  ]);
  const filtered = !!(f.q || f.stage || f.departmentId);
  const fills = fillsInSkillMatrices(user);
  const manyDepartments = departments.length > 1;
  const pending = rows.filter((r) => r.canApprove).map((r) => r.matrix!.id);
  const anyAction = rows.some((r) => r.startBlock === null || r.canEdit || r.canApprove);
  // The quarter picker also offers the one asked for, e.g. from a link to a quarter with nothing in it.
  const offered = quarters.some((q) => sameQuarter(q, quarter)) ? quarters : [quarter, ...quarters];
  const query = (overrides: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    const all = {
      quarter: isOpen ? undefined : quarterParam(quarter),
      q: f.q,
      stage: f.stage,
      department: f.departmentId ? String(f.departmentId) : undefined,
      ...overrides,
    };
    for (const [k, v] of Object.entries(all)) if (v) params.set(k, v);
    const s = params.toString();
    return s ? `?${s}` : "";
  };
  const chartDepartment = f.departmentId ?? (departments.length === 1 ? departments[0].id : undefined);

  return (
    <div className="page-fit">
      <PageHeader
        module="skills"
        context="Team"
        title="Skill matrix"
        meta={
          <>
            <span>
              <span className="font-semibold text-ink">{quarterLabel(quarter)}</span> <span className="text-ink-3">· {quarterMonths(quarter)}</span>
            </span>
            {isOpen ? (
              <span>
                Open until <span className="num">{formatDate(skillQuarterCloses(quarter))}</span>
              </span>
            ) : (
              <Status tone="na">Closed: view only</Status>
            )}
            {(["RETURNED", "SUBMITTED"] as const)
              .filter((s) => counts[s] > 0)
              .map((s) => (
                <Link key={s} href={`/skill-matrix${query({ stage: s, page: undefined })}`} className="hover:underline">
                  <Status tone={SKILL_STAGE_TONE[s]}>
                    {SKILL_STAGE_LABELS[s]} <span className="num font-semibold text-ink">{counts[s]}</span>
                  </Status>
                </Link>
              ))}
          </>
        }
        actions={
          <>
            {pending.length > 1 && <ApproveSkillDialog ids={pending} title={`Approve ${pending.length} skill matrices`} />}
            <Link href={`/skill-matrix/chart?quarter=${quarterParam(quarter)}${chartDepartment ? `&department=${chartDepartment}` : ""}`} className="btn">
              <Grid3x3 size={15} aria-hidden /> Matrix chart
            </Link>
          </>
        }
      />

      {one(sp.deleted) === "1" && (
        <div role="status" className="notice notice-ok mb-3">
          Draft deleted.
        </div>
      )}
      {!isOpen && <div className="notice notice-wait mb-3">{skillQuarterBlock(quarter, today)}</div>}

      <form method="get" className="card flex flex-wrap items-end gap-2 p-3" role="search" aria-label="Filter skill matrices">
        <div className="w-full sm:w-40">
          <label htmlFor="quarter" className="label">
            Quarter
          </label>
          <Select
            id="quarter"
            name="quarter"
            defaultValue={quarterParam(quarter)}
            options={offered.map((q) => ({ value: quarterParam(q), label: quarterLabel(q), hint: sameQuarter(q, open) ? "open" : undefined }))}
          />
        </div>
        <div className="w-full sm:w-56">
          <label htmlFor="q" className="label">
            Search
          </label>
          <input id="q" name="q" defaultValue={f.q ?? ""} className="input" placeholder="Name or staff no." type="search" />
        </div>
        <div className="w-full sm:w-48">
          <label htmlFor="stage" className="label">
            Status
          </label>
          <Select
            id="stage"
            name="stage"
            defaultValue={f.stage ?? ""}
            options={[{ value: "", label: "All statuses" }, ...SKILL_STAGES.map((s) => ({ value: s, label: SKILL_STAGE_LABELS[s], hint: String(counts[s]) }))]}
          />
        </div>
        {manyDepartments && (
          <div className="w-full sm:w-56">
            <label htmlFor="department" className="label">
              Department
            </label>
            <Select
              id="department"
              name="department"
              defaultValue={f.departmentId ? String(f.departmentId) : ""}
              options={[{ value: "", label: "All departments" }, ...departments.map((d) => ({ value: String(d.id), label: d.name }))]}
            />
          </div>
        )}
        <button type="submit" className="btn">
          Apply
        </button>
        {/* A full page load, so every field resets, including ones typed in but not applied yet. */}
        <a href={withBasePath("/skill-matrix")} className="btn">
          Clear
        </a>
        <span className="num ml-auto self-center text-[13px] text-ink-3">
          {plural(total, "staff member")}
          {filtered && " matching"}
        </span>
      </form>

      <div className="table-scroll card mt-4">
        <table className="table min-w-[900px]" aria-label="Skill matrices">
          <thead>
            <tr>
              <th className="w-px text-right whitespace-nowrap">No.</th>
              <th className="w-px whitespace-nowrap">Staff no.</th>
              <th className="min-w-[200px]">Name</th>
              <th className="hidden lg:table-cell">{manyDepartments ? "Department" : "Section"}</th>
              <th className="hidden w-px whitespace-nowrap md:table-cell">Designation</th>
              <th className="w-px whitespace-nowrap">Status</th>
              <th className="w-px text-right whitespace-nowrap">Topics</th>
              <th className="hidden xl:table-cell">Evaluator</th>
              {anyAction && (
                <th className="w-px">
                  <span className="sr-only">Action</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const href = r.matrix ? `/skill-matrix/${r.matrix.id}` : r.startBlock === null ? `/skill-matrix/new?staff=${r.staff.id}` : null;
              return (
                <ClickableRow key={r.staff.id} href={href}>
                  <td className="num muted text-right">{(at - 1) * SKILL_PAGE_SIZE + i + 1}</td>
                  <td className="num whitespace-nowrap">{r.staff.staffNo}</td>
                  <td>
                    {href ? (
                      <Link href={href} className="font-medium text-ink hover:text-accent hover:underline">
                        {r.staff.name}
                      </Link>
                    ) : (
                      <span className="font-medium">{r.staff.name}</span>
                    )}
                    {r.staff.status === "RESIGNED" && <span className="kbd-tag ml-2">Resigned</span>}
                    {r.staff.position && <div className="muted text-xs">{r.staff.position}</div>}
                  </td>
                  <td className="hidden lg:table-cell">
                    {manyDepartments ? r.staff.department.name : (r.staff.section?.name ?? <span className="muted">–</span>)}
                    {manyDepartments && r.staff.section && <div className="muted text-xs">{r.staff.section.name}</div>}
                  </td>
                  <td className="hidden whitespace-nowrap md:table-cell">{DESIGNATION_LABELS[r.staff.designation]}</td>
                  <td className="whitespace-nowrap">
                    <Status tone={SKILL_STAGE_TONE[r.stage]}>{SKILL_STAGE_LABELS[r.stage]}</Status>
                    {r.stage === "RETURNED" && <div className="muted max-w-[220px] truncate text-xs">{r.matrix?.returnReason}</div>}
                  </td>
                  <td className="num text-right">{r.matrix ? r.matrix._count.topics : <span className="muted">–</span>}</td>
                  <td className="hidden xl:table-cell">{r.matrix?.createdBy?.name ?? <span className="muted">–</span>}</td>
                  {anyAction && (
                    <td className="text-right whitespace-nowrap">
                      {r.matrix === null && r.startBlock === null && (
                        <Link href={`/skill-matrix/new?staff=${r.staff.id}`} className="btn btn-primary btn-sm">
                          <Plus size={14} aria-hidden /> Start
                        </Link>
                      )}
                      {r.matrix && r.canEdit && (
                        <Link href={`/skill-matrix/${r.matrix.id}/edit`} className="btn btn-sm">
                          Continue <ArrowRight size={14} aria-hidden />
                        </Link>
                      )}
                      {r.matrix && r.canApprove && (
                        <Link href={`/skill-matrix/${r.matrix.id}`} className="btn btn-primary btn-sm">
                          Review <ArrowRight size={14} aria-hidden />
                        </Link>
                      )}
                    </td>
                  )}
                </ClickableRow>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && (
          <div className="px-4 py-10 text-center text-[13px] text-ink-2">
            {filtered ? (
              <>
                No one matches these filters.{" "}
                <Link href={`/skill-matrix${isOpen ? "" : `?quarter=${quarterParam(quarter)}`}`} className="link">
                  Clear filters
                </Link>
              </>
            ) : isOpen ? (
              `No non-executive or contract staff ${fills ? "in your department" : "to show"} yet.`
            ) : (
              `No skill matrices on record for ${quarterLabel(quarter)}.`
            )}
          </div>
        )}
      </div>

      {pages > 1 && (
        <div className="mt-3 flex shrink-0 items-center justify-between gap-3 text-[13px] text-ink-2">
          <span className="num">
            {(at - 1) * SKILL_PAGE_SIZE + 1}–{Math.min(at * SKILL_PAGE_SIZE, total)} of {total}
          </span>
          <div className="flex gap-2">
            {at > 1 ? (
              <Link className="btn btn-sm" href={`/skill-matrix${query({ page: String(at - 1) })}`}>
                Previous
              </Link>
            ) : (
              <span className="btn btn-sm pointer-events-none opacity-50" aria-disabled>
                Previous
              </span>
            )}
            {at < pages ? (
              <Link className="btn btn-sm" href={`/skill-matrix${query({ page: String(at + 1) })}`}>
                Next
              </Link>
            ) : (
              <span className="btn btn-sm pointer-events-none opacity-50" aria-disabled>
                Next
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
