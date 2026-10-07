import type { Metadata } from "next";
import Link from "next/link";
import { forbidden, notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { Panel } from "@/components/Panel";
import { nowInMalaysia, plural } from "@/lib/format";
import { seesTeamTnas } from "@/server/rules/tna";
import { tnaFormOptions, tnaStartFor, tnaToCopy, type TnaTarget } from "@/server/services/tna";
import { requireUser } from "@/server/session";
import { createTnaAction } from "../actions";
import { TnaForm } from "../TnaForm";

export const metadata: Metadata = { title: "New TNA" };

const id = (v: string | string[] | undefined) => (typeof v === "string" && /^\d{1,9}$/.test(v) ? Number(v) : 0);

/**
 * This year's TNA for a job grade in a department (?department=&grade=, the
 * main clerk) or for a person (?staff=, L&D on their behalf). ?copy=1 starts
 * from the last one on record.
 */
export default async function NewTnaPage({ searchParams }: PageProps<"/tna/new">) {
  const user = await requireUser();
  const sp = await searchParams;
  const target: TnaTarget | null = id(sp.staff) ? { staffId: id(sp.staff) } : id(sp.department) && id(sp.grade) ? { departmentId: id(sp.department), jobGrade: id(sp.grade) } : null;
  if (target && "staffId" in target && target.staffId === user.id) redirect(`/my-tna/edit${sp.copy === "1" ? "?copy=1" : ""}`);
  if (!seesTeamTnas(user)) forbidden();
  if (!target) notFound();
  const start = await tnaStartFor(user, target, nowInMalaysia());
  if (!start) notFound();
  // Already started (by this person or someone else): go to it rather than refuse.
  if (start.existingId) redirect(`/tna/${start.existingId}`);
  const { staff, department, jobGrade, year } = start;
  const back = `/tna?view=${staff ? "staff" : "grade"}`;
  const copy = !start.blocked && sp.copy === "1" ? await tnaToCopy(start.owner, jobGrade, year) : null;
  const options = await tnaFormOptions((copy?.content ?? []).map((r) => r.optionId).filter((o): o is number => o !== null));

  return (
    <div>
      <PageHeader
        module="tna"
        context={{ href: back, label: "TNA" }}
        title={staff ? staff.name : `Job grade ${jobGrade}`}
        meta={
          <>
            {staff && <span className="num">{staff.staffNo}</span>}
            <span>{department.name}</span>
            <span className="font-semibold text-ink">{year}</span>
            {start.headcount !== null && <span>Covers {plural(start.headcount, "staff member")}</span>}
          </>
        }
      />
      <Panel
        className="max-w-[1280px]"
        title={`Training Need Analysis for ${year}`}
        description={
          copy
            ? `Started from the ${copy.year} TNA. Change what is different this year; nothing is saved until you save.`
            : staff
              ? `The training ${staff.name} needs this year, filled in on their behalf.`
              : `The training that ${department.name}'s staff on job grade ${jobGrade} need this year. One TNA covers them all.`
        }
      >
        {start.blocked ? (
          <div className="flex flex-col items-start gap-3">
            <div className="notice notice-wait">{start.blocked}</div>
            <Link href={back} className="btn">
              Back to the list
            </Link>
          </div>
        ) : (
          <TnaForm action={createTnaAction.bind(null, target)} initial={copy?.content ?? null} options={options} year={year} cancelHref={back} />
        )}
      </Panel>
    </div>
  );
}
