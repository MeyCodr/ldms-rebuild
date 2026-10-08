import type { Metadata } from "next";
import Link from "next/link";
import { forbidden, notFound } from "next/navigation";
import { CalendarRange, Copy, ListChecks, Pencil, Plus, ScanSearch, UserCheck, UserRound } from "lucide-react";
import { HistoryPanel, type HistoryFields } from "@/components/HistoryPanel";
import { PageHeader } from "@/components/PageHeader";
import { Panel } from "@/components/Panel";
import { Fact } from "@/components/RecordParts";
import { EmptyState } from "@/components/ui/EmptyState";
import { Status } from "@/components/ui/Status";
import { TNA_LEVELS, TNA_METHOD_LABELS, tnaGap } from "@/lib/forms/tna";
import { TNI_HEADING } from "@/lib/forms/tni";
import { formatDateTime, nowInMalaysia, plural } from "@/lib/format";
import { can } from "@/server/permissions";
import { parseTniYear, seesTnis, tniEditBlock, tniOpenYear, tniYearBlock } from "@/server/rules/tni";
import { getTni, tniHistory, tniYearsOf } from "@/server/services/tni";
import { requireUser } from "@/server/session";

export const metadata: Metadata = { title: "TNI" };

const HISTORY_FIELDS: HistoryFields = { rows: { label: "Rows" } };
const LEVEL = "w-px text-right whitespace-nowrap";

/** One department's TNI for a year: its rows, and for the HOD the way to fill it in or change it. */
export default async function TniRecordPage({ params, searchParams }: PageProps<"/tni/[departmentId]">) {
  const user = await requireUser();
  if (!seesTnis(user)) forbidden();
  const departmentId = Number((await params).departmentId);
  if (!Number.isInteger(departmentId)) notFound();
  const today = nowInMalaysia();
  const open = tniOpenYear(today);
  const sp = await searchParams;
  const year = parseTniYear(typeof sp.year === "string" ? sp.year : undefined) ?? open;
  const t = await getTni(user, departmentId, year, today);
  if (!t) notFound();
  const [years, history] = await Promise.all([tniYearsOf(departmentId), t.tni && can(user, "audit.view") ? tniHistory(t.tni.id) : []]);
  const { department, tni, content } = t;
  const others = years.filter((y) => y.year !== year);
  // This year's can be started from the latest earlier one that has rows.
  const canEditNow = tniEditBlock(department, open, t.viewer, today) === null;
  const hasOpen = years.some((y) => y.year === open);
  const copyFrom = years.find((y) => y.year < open && y.rows > 0);

  return (
    <div>
      <PageHeader
        module="tni"
        context={{ href: `/tni${year === open ? "" : `?year=${year}`}`, label: "TNI" }}
        title={department.name}
        meta={
          <>
            <span>{department.division.name}</span>
            <span className="font-semibold text-ink">{year}</span>
            {tni ? <Status tone="ok">Filled in</Status> : <Status tone="na">Not filled in</Status>}
          </>
        }
        actions={
          <>
            {t.editBlock === null && tni && (
              <Link href={`/tni/${department.id}/edit`} className="btn">
                <Pencil size={14} aria-hidden /> Edit
              </Link>
            )}
            {/* Looking at an earlier year with nothing filled in for this one yet: carry it forward. */}
            {year !== open && canEditNow && !hasOpen && content.length > 0 && (
              <Link href={`/tni/${department.id}/edit?copy=1`} className="btn btn-primary">
                <Copy size={14} aria-hidden /> Start {open}&apos;s from this
              </Link>
            )}
          </>
        }
      />

      {sp.saved === "1" && tni && (
        <div role="status" className="notice notice-ok mb-5">
          Saved. L&amp;D can now see {department.name}&apos;s TNI for {year}.
        </div>
      )}
      {year !== open && <div className="notice notice-wait mb-5">{tniYearBlock(year, today)}</div>}

      {!tni ? (
        <div className="card">
          <EmptyState
            icon={ScanSearch}
            title={`No TNI for ${year} yet`}
            action={
              t.editBlock === null ? (
                <div className="flex flex-wrap justify-center gap-2">
                  <Link href={`/tni/${department.id}/edit`} className="btn btn-primary">
                    <Plus size={14} aria-hidden /> Fill in the TNI
                  </Link>
                  {copyFrom && (
                    <Link href={`/tni/${department.id}/edit?copy=1`} className="btn">
                      <Copy size={14} aria-hidden /> Start from {copyFrom.year}&apos;s
                    </Link>
                  )}
                </div>
              ) : undefined
            }
          >
            {t.editBlock === null
              ? "List where the department's performance falls short of what is expected, and how each gap will be closed."
              : year === open
                ? t.hod
                  ? `${t.hod.name}, the HOD, fills it in.`
                  : `${department.name} has no active HOD, so no one can fill it in yet.`
                : `${department.name} had none on record that year.`}
          </EmptyState>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          <section aria-label="At a glance" className="card p-5 sm:p-6">
            <dl className="grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
              <Fact icon={CalendarRange} label="Year">
                {year}
              </Fact>
              <Fact icon={UserCheck} label="HOD">
                {t.hod?.name ?? <span className="text-ink-3">No active HOD</span>}
              </Fact>
              <Fact icon={UserRound} label="Last saved">
                <span className="num">{formatDateTime(tni.updatedAt)}</span>
                {tni.updatedBy && <span className="text-ink-3"> · {tni.updatedBy.name}</span>}
              </Fact>
              <Fact icon={ListChecks} label="Performance indicators">
                <span className="num font-semibold">{content.length}</span>
              </Fact>
            </dl>
          </section>

          <Panel title={TNI_HEADING} action={<span className="text-ink-3">{plural(content.length, "row")}</span>} flush>
            <div className="overflow-x-auto">
              <table className="table min-w-[1080px]" aria-label="Performance indicators">
                <thead>
                  <tr>
                    <th className="w-px pl-5 text-right whitespace-nowrap">No.</th>
                    <th className="min-w-[220px]">Performance indicator</th>
                    <th className={LEVEL}>Expected</th>
                    <th className={LEVEL}>Actual</th>
                    <th className={LEVEL}>Gap</th>
                    <th className="min-w-[180px]">Possible causes</th>
                    <th className="min-w-[120px]">Attitude / Skill / Knowledge</th>
                    <th className="w-px whitespace-nowrap">L&amp;D method</th>
                    <th className="min-w-[160px] pr-5">Evaluation method</th>
                  </tr>
                </thead>
                <tbody>
                  {content.map((r, i) => (
                    <tr key={i} className="align-top">
                      <td className="num muted pl-5 text-right">{i + 1}</td>
                      <td className="break-words whitespace-pre-line">{r.indicator}</td>
                      <td className="num text-right">{r.expected}</td>
                      <td className="num text-right">{r.actual}</td>
                      <td className="num text-right font-semibold">{tnaGap(r.expected, r.actual)}</td>
                      <td className="break-words whitespace-pre-line">{r.causes}</td>
                      <td className="break-words">{r.ask}</td>
                      <td className="whitespace-nowrap">{r.method && TNA_METHOD_LABELS[r.method]}</td>
                      <td className="pr-5 break-words">{r.evaluation}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel title="Performance levels" description="Expected and actual performance">
            <dl className="grid gap-x-6 gap-y-2 text-[13px] sm:grid-cols-2 lg:grid-cols-5">
              {TNA_LEVELS.map((l) => (
                <div key={l.value} className="grid grid-cols-[14px_1fr] gap-3">
                  <dt className="num font-semibold">{l.value}</dt>
                  <dd>
                    {l.label}
                    <span className="block text-xs text-ink-3">{l.hint}</span>
                  </dd>
                </div>
              ))}
            </dl>
          </Panel>

          <HistoryPanel entries={history} fields={HISTORY_FIELDS} />
        </div>
      )}

      {others.length > 0 && (
        <p className="mt-5 px-1 text-[13px] text-ink-2">
          Other years:{" "}
          {others.map((y, i) => (
            <span key={y.year}>
              {i > 0 && ", "}
              <Link href={y.year === open ? `/tni/${department.id}` : `/tni/${department.id}?year=${y.year}`} className="link">
                {y.year}
              </Link>
            </span>
          ))}
          .
        </p>
      )}
    </div>
  );
}
