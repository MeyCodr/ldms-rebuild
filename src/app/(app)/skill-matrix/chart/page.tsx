import type { Metadata } from "next";
import Link from "next/link";
import { forbidden } from "next/navigation";
import { FileDown, Grid3x3 } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Select } from "@/components/ui/Select";
import { withBasePath } from "@/lib/base-path";
import { SKILL_SECTION_LABELS, SKILL_SECTIONS } from "@/lib/forms/skill";
import { nowInMalaysia, plural } from "@/lib/format";
import {
  parseQuarter,
  quarterLabel,
  quarterMonths,
  quarterParam,
  sameQuarter,
  seesSkillMatrices,
  SKILL_LEVELS,
  skillLevel,
  skillOpenQuarter,
  type SkillLevel,
} from "@/server/rules/skill";
import { skillChart, skillDepartments, skillQuarters } from "@/server/services/skill";
import { requireUser } from "@/server/session";

export const metadata: Metadata = { title: "Matrix chart" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

// One hue, light to dark: the higher the level, the deeper the cell (.matrix in globals.css). The score is always written in the cell too.
const LEVEL_FILL: Record<SkillLevel, string> = { 0: "m-l0", 25: "m-l25", 50: "m-l50", 75: "m-l75", 100: "m-l100" };
const levelOf = (score: number) => SKILL_LEVELS.find((l) => l.level === skillLevel(score))!;
/** The lowest level first, as the scale reads left to right. */
const SCALE = [...SKILL_LEVELS].reverse();
const scaleRange = (level: SkillLevel) => (level === 100 ? "100" : level === 0 ? "0–24" : `${level}–${level === 75 ? 99 : level + 24}`);

/** A score in its coloured cell, or a dot when the person wasn't rated on the topic. */
function Score({ score, what }: { score: number | null; what: string }) {
  if (score === null)
    return (
      <span className="m-fill m-none" title={`${what}: not rated`}>
        ·<span className="sr-only">Not rated</span>
      </span>
    );
  const level = levelOf(score);
  return (
    <span className={`m-fill ${LEVEL_FILL[level.level]}`} title={`${what}: ${score}%, ${level.label}`}>
      {score}
    </span>
  );
}

/** A department's skill matrices for a quarter as a grid of staff against topics. (The Excel export lays the same figures out by level, as the old chart did.) */
export default async function SkillChartPage({ searchParams }: PageProps<"/skill-matrix/chart">) {
  const user = await requireUser();
  if (!seesSkillMatrices(user)) forbidden();
  const today = nowInMalaysia();
  const sp = await searchParams;
  const open = skillOpenQuarter(today);
  const quarter = parseQuarter(one(sp.quarter)) ?? open;
  const [departments, quarters] = await Promise.all([skillDepartments(user), skillQuarters(user, today)]);
  const asked = Number(one(sp.department));
  const departmentId = departments.find((d) => d.id === asked)?.id ?? (departments.length === 1 ? departments[0].id : undefined);
  const chart = departmentId ? await skillChart(user, departmentId, quarter) : null;
  const offered = quarters.some((q) => sameQuarter(q, quarter)) ? quarters : [quarter, ...quarters];
  const pending = chart?.rows.filter((r) => r.status === "SUBMITTED").length ?? 0;
  const params = `quarter=${quarterParam(quarter)}${departmentId ? `&department=${departmentId}` : ""}`;
  const mean = (values: (number | null)[]) => {
    const rated = values.filter((v): v is number => v !== null);
    return rated.length ? Math.round(rated.reduce((a, b) => a + b, 0) / rated.length) : null;
  };
  // Each topic's average across the people rated on it, and the average of everyone's averages.
  const columnAverages = chart ? chart.columns.map((_, j) => mean(chart.rows.map((r) => r.scores[j]))) : [];
  const overall = chart ? mean(chart.rows.map((r) => r.average)) : null;
  const firstOfSection = (i: number) => !!chart && (i === 0 || chart.columns[i - 1].section !== chart.columns[i].section);

  return (
    <div className="page-fit">
      <PageHeader
        module="skills"
        context={{ href: `/skill-matrix?${params}`, label: "Skill matrix" }}
        title="Matrix chart"
        meta={
          <>
            {chart && <span className="font-semibold text-ink">{chart.department.name}</span>}
            <span>
              <span className="font-semibold text-ink">{quarterLabel(quarter)}</span> <span className="text-ink-3">· {quarterMonths(quarter)}</span>
            </span>
            {chart && (
              <span>
                {plural(chart.rows.length, "staff member")}, {plural(chart.columns.length, "topic")}
              </span>
            )}
          </>
        }
        actions={
          chart &&
          chart.rows.length > 0 && (
            <a href={withBasePath(`/skill-matrix/chart/export?${params}`)} className="btn">
              <FileDown size={15} aria-hidden /> Export to Excel
            </a>
          )
        }
      />

      <form method="get" className="card flex flex-wrap items-end gap-2 p-3" role="search" aria-label="Choose the chart">
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
        {departments.length > 1 && (
          <div className="w-full sm:w-64">
            <label htmlFor="department" className="label">
              Department
            </label>
            <Select
              id="department"
              name="department"
              defaultValue={departmentId ? String(departmentId) : ""}
              placeholder="Choose a department"
              options={departments.map((d) => ({ value: String(d.id), label: d.name }))}
            />
          </div>
        )}
        <button type="submit" className="btn">
          Show
        </button>
        {/* The scale, lowest to highest: the same fills as the cells. */}
        <ul aria-label="Levels" className="matrix-scale grid w-full grid-cols-5 items-start gap-1 sm:ml-auto sm:w-auto sm:self-center">
          {SCALE.map((l) => (
            <li key={l.level} className="min-w-0 sm:w-[96px]" title={l.hint || undefined}>
              <span aria-hidden className={`m-fill text-[11px] ${LEVEL_FILL[l.level]}`}>
                {scaleRange(l.level)}
              </span>
              <span className="mt-1 block text-center text-[11px] leading-tight text-ink-2">{l.label}</span>
            </li>
          ))}
        </ul>
      </form>

      {!chart ? (
        <div className="card mt-4">
          <EmptyState icon={Grid3x3} title="Choose a department">
            The chart shows one department at a time: its staff down the side and the topics they were rated on across the top.
          </EmptyState>
        </div>
      ) : chart.rows.length === 0 ? (
        <div className="card mt-4">
          <EmptyState icon={Grid3x3} title={`No matrices to chart for ${quarterLabel(quarter)}`}>
            The chart shows matrices that have been submitted to the HOD or approved. Drafts aren&apos;t included.{" "}
            <Link href={`/skill-matrix?${params}`} className="link">
              See the list
            </Link>
          </EmptyState>
        </div>
      ) : (
        <>
          {pending > 0 && (
            <p className="mt-3 px-1 text-[13px] text-ink-2">
              {plural(pending, "matrix", "matrices")} here {pending === 1 ? "is" : "are"} still waiting for the HOD&apos;s approval, marked{" "}
              <span className="font-medium">pending</span>.
            </p>
          )}
          {/* Full width, and only as tall as the chart: the topics share the width, and scroll sideways once there are too many to fit. */}
          <div className="table-scroll card mt-3" style={{ flex: "0 1 auto" }}>
            <table className="matrix" aria-label="Matrix chart" style={{ minWidth: 250 + 150 + chart.columns.length * 84 }}>
              <thead>
                <tr>
                  <th className="m-staff" />
                  {SKILL_SECTIONS.map((s) => {
                    const span = chart.columns.filter((c) => c.section === s).length;
                    return span ? (
                      <th key={s} colSpan={span} scope="colgroup" className="m-group m-first">
                        {SKILL_SECTION_LABELS[s]}
                      </th>
                    ) : null;
                  })}
                  <th className="m-avg" />
                </tr>
                <tr>
                  <th scope="col" className="m-staff align-bottom">
                    <span className="eyebrow flex gap-3 pb-1.5 text-[10.5px]">
                      <span className="w-6 text-right">No.</span>
                      <span>Staff</span>
                    </span>
                  </th>
                  {chart.columns.map((c, i) => (
                    <th key={c.key} scope="col" className={`m-topic ${firstOfSection(i) ? "m-first" : ""}`} title={c.name}>
                      <span>{c.name}</span>
                    </th>
                  ))}
                  <th scope="col" className="m-avg" title="The average of the person's topic scores">
                    <span className="eyebrow text-[10.5px]">Average</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {chart.rows.map((r, i) => (
                  <tr key={r.id}>
                    <th scope="row" className="m-staff">
                      <span className="flex items-baseline gap-3">
                        <span className="num w-6 shrink-0 text-right text-xs text-ink-3">{i + 1}</span>
                        <span className="min-w-0">
                          <Link
                            href={`/skill-matrix/${r.id}`}
                            className="block truncate font-medium text-ink hover:text-accent hover:underline"
                            title={r.staff.name}
                          >
                            {r.staff.name}
                          </Link>
                          <span className="block text-[11.5px] leading-tight text-ink-3">
                            <span className="num">{r.staff.staffNo}</span>
                            {r.status === "SUBMITTED" && <span className="font-medium text-wait"> · pending</span>}
                          </span>
                        </span>
                      </span>
                    </th>
                    {r.scores.map((score, j) => (
                      <td key={chart.columns[j].key} className={`m-cell ${firstOfSection(j) ? "m-first" : ""}`}>
                        <Score score={score} what={chart.columns[j].name} />
                      </td>
                    ))}
                    <td className="m-avg">
                      {r.average !== null ? (
                        <>
                          <span className="num block text-[13.5px] leading-tight font-semibold">{r.average}%</span>
                          <span className="block text-[11px] leading-tight text-ink-3">{levelOf(r.average).label}</span>
                        </>
                      ) : (
                        <span className="text-ink-3">–</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              {chart.rows.length > 1 && (
                <tfoot>
                  <tr>
                    <th scope="row" className="m-staff">
                      <span className="flex gap-3">
                        <span className="w-6" />
                        <span className="text-[12.5px] font-semibold text-ink">Department average</span>
                      </span>
                    </th>
                    {columnAverages.map((score, j) => (
                      <td key={chart.columns[j].key} className={`m-cell ${firstOfSection(j) ? "m-first" : ""}`}>
                        <Score score={score} what={`${chart.columns[j].name}, department average`} />
                      </td>
                    ))}
                    <td className="m-avg">
                      {overall !== null && (
                        <>
                          <span className="num block text-[13.5px] leading-tight font-semibold">{overall}%</span>
                          <span className="block text-[11px] leading-tight text-ink-3">{levelOf(overall).label}</span>
                        </>
                      )}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </>
      )}
    </div>
  );
}
