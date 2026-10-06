import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { ClickableRow } from "@/components/ui/ClickableRow";
import { DateRangeFilter } from "@/components/ui/DateRangeFilter";
import { Select } from "@/components/ui/Select";
import { Status } from "@/components/ui/Status";
import { formatDate, formatHours, nowInMalaysia, plural, toDateInput } from "@/lib/format";
import { TRAINING_TYPE_LABELS } from "@/lib/validation/training";
import { PME_STAGE_TONE } from "@/server/rules/pme";
import { myTrainings, type MyTrainingRow } from "@/server/services/myTraining";
import { myPmes } from "@/server/services/pme";
import { requireUser } from "@/server/session";
import { withBasePath } from "@/lib/base-path";
import { pmeStageLabel } from "../pme/labels";
import { MY_STATUSES, myStatus, type MyStatusKey } from "./labels";

export const metadata: Metadata = { title: "My training" };

const sumHours = (rows: MyTrainingRow[]) => Math.round(rows.reduce((h, r) => h + r.hours, 0) * 100) / 100;
/** A YYYY-MM-DD filter value, or "" when it's missing or not a date. */
const isoDate = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) ? v : "");

export default async function MyTrainingPage({ searchParams }: PageProps<"/my-training">) {
  const user = await requireUser();
  const today = nowInMalaysia();
  const sp = await searchParams;
  const [rows, pmes] = await Promise.all([myTrainings(user, today), myPmes(user, today)]);

  // Filters: a search, a date range and a status. Every training the
  // person is on, newest first, is the starting point. The date range keeps
  // trainings that start on or after the start date and end on or before the end date.
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const from = isoDate(sp.from);
  const to = isoDate(sp.to);
  const status = typeof sp.status === "string" && sp.status in MY_STATUSES ? (sp.status as MyStatusKey) : null;
  const filtered = !!(q || from || to || status);
  const needle = q.toLowerCase();
  const shown = rows.filter(
    (r) =>
      (!from || toDateInput(r.training.startDate) >= from) &&
      (!to || toDateInput(r.training.endDate) <= to) &&
      (!status || myStatus(r).key === status) &&
      (!needle || [r.training.title, r.training.trainerName, r.training.venue].some((v) => v?.toLowerCase().includes(needle))),
  );

  // A PME to acknowledge: their HOD has evaluated them for that training (executives and managers).
  const toAcknowledge = (r: MyTrainingRow) => pmes.get(r.id)?.blocked.ACKNOWLEDGE === null;
  // The button column only when a listed training has a form waiting, or a PME to acknowledge.
  const anyDue = shown.some((r) => r.access.mode === "submit" || toAcknowledge(r));
  // The PME column only for people who have any.
  const anyPme = shown.some((r) => pmes.has(r.id));
  const pmesDue = rows.filter(toAcknowledge);

  const thisYear = today.getUTCFullYear();
  const due = rows.filter((r) => r.access.mode === "submit").length;
  const yearHours = sumHours(rows.filter((r) => r.counts && r.training.startDate.getUTCFullYear() === thisYear));

  return (
    <div className="page-fit">
      <PageHeader
        module="learning"
        context="My work"
        title="My training"
        meta={
          <>
            <span>
              <span className="num font-semibold text-ink">{formatHours(yearHours)}</span> of learning in {thisYear}
            </span>
            {due > 0 && (
              <Link href="/my-training?status=due" className="hover:underline">
                <Status tone="wait">{plural(due, "form")} to fill in</Status>
              </Link>
            )}
            {pmesDue.length > 0 && (
              <Link href={`/pme/${pmes.get(pmesDue[0].id)!.id}`} className="hover:underline">
                <Status tone="wait">{plural(pmesDue.length, "PME")} to acknowledge</Status>
              </Link>
            )}
          </>
        }
        actions={
          <Link href="/my-training/ojt/new" className="btn btn-primary">
            <Plus size={15} aria-hidden /> Record OJT
          </Link>
        }
      />

      {sp.deleted === "1" && (
        <div role="status" className="notice notice-ok mb-3">
          OJT deleted.
        </div>
      )}

      <form method="get" className="card flex flex-wrap items-end gap-2 p-3" role="search" aria-label="Filter my trainings">
        <div className="w-full sm:w-56">
          <label htmlFor="q" className="label">
            Search
          </label>
          <input id="q" name="q" defaultValue={q} className="input" placeholder="Title, trainer or venue" type="search" />
        </div>
        <div className="w-full sm:w-40">
          <label htmlFor="status" className="label">
            Status
          </label>
          <Select
            id="status"
            name="status"
            defaultValue={status ?? ""}
            options={[{ value: "", label: "All statuses" }, ...Object.entries(MY_STATUSES).map(([value, label]) => ({ value, label }))]}
          />
        </div>
        <DateRangeFilter from={from} to={to} />
        <button type="submit" className="btn">
          Apply
        </button>
        {/* A full page load, so every field resets, including ones typed in but not applied yet. */}
        <a href={withBasePath("/my-training")} className="btn">
          Clear
        </a>
        <span className="num ml-auto self-center text-[13px] text-ink-3">
          {plural(shown.length, "training")}
          {filtered && " matching"}
        </span>
      </form>

      <div className="table-scroll card mt-4">
        <table className={`table ${anyPme ? "min-w-[960px]" : "min-w-[820px]"}`} aria-label="My trainings">
          <thead>
            <tr>
              <th className="w-px text-right whitespace-nowrap">No.</th>
              <th className="min-w-[220px]">Training</th>
              <th className="w-px whitespace-nowrap">Start date</th>
              <th className="w-px whitespace-nowrap">End date</th>
              <th className="w-px whitespace-nowrap">Type</th>
              <th className="min-w-[140px]">Venue</th>
              <th className="w-px text-right whitespace-nowrap">Training hours</th>
              <th className="w-px whitespace-nowrap">Status</th>
              {anyPme && (
                <th className="w-px whitespace-nowrap" title="Performance Monitoring Evaluation: your HOD's evaluation, three months after the training">
                  PME
                </th>
              )}
              {anyDue && (
                <th className="hidden w-px lg:table-cell">
                  <span className="sr-only">Action</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {shown.map((r, i) => {
              const t = r.training;
              const s = myStatus(r);
              const pme = pmes.get(r.id);
              return (
                <ClickableRow key={r.id} href={`/my-training/${r.id}`}>
                  <td className="num muted text-right">{i + 1}</td>
                  <td>
                    <Link
                      href={`/my-training/${r.id}`}
                      className={`font-medium text-ink hover:text-accent hover:underline ${t.status === "CANCELLED" ? "line-through decoration-ink-3" : ""}`}
                    >
                      {t.title}
                    </Link>
                  </td>
                  <td className="num whitespace-nowrap">{formatDate(t.startDate)}</td>
                  <td className="num whitespace-nowrap">{formatDate(t.endDate)}</td>
                  <td className="whitespace-nowrap">
                    <span className="tag">{TRAINING_TYPE_LABELS[t.type]}</span>
                  </td>
                  <td>{t.venue ?? <span className="muted">–</span>}</td>
                  {/* Completed hours count; still to come or due, they will once completed; absent or cancelled, never. */}
                  <td className={`num text-right whitespace-nowrap ${r.counts ? "" : "muted"}`}>
                    {r.counts || s.key === "upcoming" || s.key === "due" ? formatHours(r.hours) : "–"}
                  </td>
                  <td className="whitespace-nowrap">
                    <Status tone={s.tone}>{s.label}</Status>
                  </td>
                  {anyPme && (
                    <td className="whitespace-nowrap">
                      {pme ? (
                        <Link href={`/pme/${pme.id}`} className="hover:underline">
                          <Status tone={PME_STAGE_TONE[pme.stage]}>{pmeStageLabel(pme.stage, true)}</Status>
                        </Link>
                      ) : (
                        <span className="muted">–</span>
                      )}
                    </td>
                  )}
                  {anyDue && (
                    <td className="hidden text-right lg:table-cell">
                      {s.key !== "due" && pme && toAcknowledge(r) && (
                        <Link href={`/pme/${pme.id}`} className="btn btn-primary btn-sm whitespace-nowrap">
                          Acknowledge PME <ArrowRight size={14} aria-hidden />
                        </Link>
                      )}
                      {s.key === "due" && (
                        <Link href={`/my-training/${r.id}`} className="btn btn-primary btn-sm whitespace-nowrap">
                          {r.kind === "OJT" ? "Give answers" : "Give feedback"} <ArrowRight size={14} aria-hidden />
                        </Link>
                      )}
                    </td>
                  )}
                </ClickableRow>
              );
            })}
          </tbody>
        </table>
        {shown.length === 0 && (
          <div className="px-4 py-10 text-center text-[13px] text-ink-2">
            {filtered ? (
              <>
                None of your trainings match these filters.{" "}
                <Link href="/my-training" className="link">
                  Clear filters
                </Link>
              </>
            ) : (
              "No trainings yet. Trainings you're added to, and OJT you record, show here."
            )}
          </div>
        )}
      </div>
    </div>
  );
}
