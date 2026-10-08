import type { Metadata } from "next";
import Link from "next/link";
import { FileSpreadsheet } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Panel } from "@/components/Panel";
import { Progress } from "@/components/ui/Progress";
import { Select } from "@/components/ui/Select";
import { withBasePath } from "@/lib/base-path";
import { TNA_METHOD_LABELS, tnaSectionTitle } from "@/lib/forms/tna";
import { nowInMalaysia, plural } from "@/lib/format";
import { parseTnaYear } from "@/server/rules/tna";
import { tnaOpen, tnaSummary, tnaYears } from "@/server/services/tna";
import { requirePermission } from "@/server/session";

export const metadata: Metadata = { title: "TNA summary" };

/** L&D's view of a year: how far each department has got, and what the approved and submitted TNAs ask for. */
export default async function TnaSummaryPage({ searchParams }: PageProps<"/tna/summary">) {
  const user = await requirePermission("tna.manage");
  const today = nowInMalaysia();
  const open = await tnaOpen(today);
  const raw = (await searchParams).year;
  const year = parseTnaYear(typeof raw === "string" ? raw : undefined) ?? open;
  const [s, years] = await Promise.all([tnaSummary(user, year), tnaYears(today)]);
  const offered = years.includes(year) ? years : [year, ...years].sort((a, b) => b - a);
  const cell = (n: number) => (n ? <span className="num">{n}</span> : <span className="muted">–</span>);

  return (
    <div>
      <PageHeader
        module="tna"
        context={{ href: `/tna${year === open ? "" : `?year=${year}`}`, label: "TNA" }}
        title="TNA summary"
        meta={
          <>
            <span className="font-semibold text-ink">{year}</span>
            <span>
              <span className="num font-semibold text-ink">{s.totals.approved}</span> of <span className="num">{s.totals.due}</span> approved
            </span>
            {s.totals.submitted > 0 && (
              <span>
                <span className="num">{s.totals.submitted}</span> waiting for a HOD
              </span>
            )}
            {s.totals.notStarted > 0 && (
              <span>
                <span className="num">{s.totals.notStarted}</span> not started
              </span>
            )}
          </>
        }
        actions={
          <a href={withBasePath(`/tna/export?year=${year}`)} className="btn" download>
            <FileSpreadsheet size={15} aria-hidden /> Export to Excel
          </a>
        }
      />

      <form method="get" className="card mb-5 flex flex-wrap items-end gap-2 p-3" role="search" aria-label="Choose a year">
        <div className="w-full sm:w-40">
          <label htmlFor="year" className="label">
            Year
          </label>
          <Select id="year" name="year" defaultValue={String(year)} options={offered.map((y) => ({ value: String(y), label: String(y), hint: y === open ? "open" : undefined }))} />
        </div>
        <button type="submit" className="btn">
          Apply
        </button>
      </form>

      <div className="flex flex-col gap-5">
        <Panel
          title="By department"
          description="Individual: staff who fill in their own. By job grade: one per grade someone is on. A TNA counts under where it stands today."
          flush
        >
          <div className="overflow-x-auto">
            <table className="table min-w-[900px]" aria-label="TNAs by department">
              <thead>
                <tr>
                  <th className="w-px pl-5 text-right whitespace-nowrap">No.</th>
                  <th className="min-w-[200px]">Department</th>
                  <th className="w-px whitespace-nowrap">Kind</th>
                  <th className="w-px text-right whitespace-nowrap">Due</th>
                  <th className="w-px text-right whitespace-nowrap">Not started</th>
                  <th className="w-px text-right whitespace-nowrap">Draft</th>
                  <th className="w-px text-right whitespace-nowrap">Sent back</th>
                  <th className="w-px text-right whitespace-nowrap">Waiting for HOD</th>
                  <th className="w-px text-right whitespace-nowrap">Approved</th>
                  <th className="w-[160px] pr-5">Approved, of due</th>
                </tr>
              </thead>
              <tbody>
                {s.departments.flatMap((d, i) =>
                  (
                    [
                      ["Individual", "staff", d.dueOwn, d.individuals],
                      ["By job grade", "grade", d.dueGrades, d.byGrade],
                    ] as const
                  )
                    .filter(([, , due]) => due > 0)
                    .map(([label, view, due, c], j) => (
                      <tr key={`${d.department.id}-${view}`}>
                        <td className="num muted pl-5 text-right">{j === 0 ? i + 1 : ""}</td>
                        <td>
                          {j === 0 && (
                            <Link href={`/tna?department=${d.department.id}${year === open ? "" : `&year=${year}`}`} className="font-medium text-ink hover:text-accent hover:underline">
                              {d.department.name}
                            </Link>
                          )}
                        </td>
                        <td className="whitespace-nowrap">
                          <Link href={`/tna?view=${view}&department=${d.department.id}${year === open ? "" : `&year=${year}`}`} className="link">
                            {label}
                          </Link>
                        </td>
                        <td className="num text-right">{due}</td>
                        <td className="text-right">{cell(c.NOT_STARTED)}</td>
                        <td className="text-right">{cell(c.DRAFT)}</td>
                        <td className="text-right">{cell(c.RETURNED)}</td>
                        <td className="text-right">{cell(c.SUBMITTED)}</td>
                        <td className="text-right">{cell(c.APPROVED)}</td>
                        <td className="pr-5">
                          <div className="flex items-center gap-2">
                            <Progress value={c.APPROVED} max={due} label={`${d.department.name}, ${label.toLowerCase()}: approved`} size="sm" tone="ok" className="flex-1" />
                            <span className="num w-9 text-right text-xs text-ink-2">{Math.round((c.APPROVED / due) * 100)}%</span>
                          </div>
                        </td>
                      </tr>
                    )),
                )}
              </tbody>
            </table>
          </div>
          {s.departments.length === 0 && <p className="px-5 py-8 text-center text-[13px] text-ink-3">No department has a TNA due for {year}.</p>}
        </Panel>

        <div className="grid items-start gap-5 lg:grid-cols-3">
          <Panel title="By heading" description={`${plural(s.totals.rows, "training need")} in submitted and approved TNAs`}>
            <Shares rows={s.sections.map((x) => ({ label: tnaSectionTitle(x.section), count: x.count, share: x.share }))} />
          </Panel>
          <Panel title="How it will be achieved" description="The same training needs, by method">
            <Shares rows={s.methods.map((x) => ({ label: TNA_METHOD_LABELS[x.method], count: x.count, share: x.share }))} />
          </Panel>
          <Panel title="Asked for most" description="The ten trainings named most often">
            {s.trainings.length === 0 ? (
              <p className="text-[13px] text-ink-3">Nothing submitted yet.</p>
            ) : (
              <ol className="flex flex-col gap-2 text-[13px]">
                {s.trainings.map((t, i) => (
                  <li key={t.name} className="grid grid-cols-[18px_1fr_auto] gap-2">
                    <span className="num text-ink-3">{i + 1}.</span>
                    <span className="min-w-0 break-words">{t.name}</span>
                    <span className="num font-semibold">{t.count}</span>
                  </li>
                ))}
              </ol>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

/** A list of labelled bars: each one's count and its share of the whole. */
function Shares({ rows }: { rows: { label: string; count: number; share: number }[] }) {
  return (
    <ul className="flex flex-col gap-3 text-[13px]">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="mb-1 flex items-baseline justify-between gap-3">
            <span className="min-w-0">{r.label}</span>
            <span className="num shrink-0 text-ink-2">
              <span className="font-semibold text-ink">{r.count}</span> · {r.share}%
            </span>
          </div>
          <Progress value={r.share} max={100} label={`${r.label}: share of training needs`} size="sm" />
        </li>
      ))}
    </ul>
  );
}
