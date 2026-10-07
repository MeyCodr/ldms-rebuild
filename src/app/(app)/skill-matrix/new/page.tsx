import type { Metadata } from "next";
import Link from "next/link";
import { forbidden, notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { Panel } from "@/components/Panel";
import { formatDate, nowInMalaysia } from "@/lib/format";
import { DESIGNATION_LABELS } from "@/lib/validation/staff";
import { quarterLabel, quarterMonths, seesSkillMatrices, skillQuarterCloses } from "@/server/rules/skill";
import { skillStartFor } from "@/server/services/skill";
import { requireUser } from "@/server/session";
import { createSkillMatrixAction } from "../actions";
import { SkillForm } from "../SkillForm";

export const metadata: Metadata = { title: "New skill matrix" };

/** A new matrix for one staff member (?staff=id), for the open quarter. */
export default async function NewSkillMatrixPage({ searchParams }: PageProps<"/skill-matrix/new">) {
  const user = await requireUser();
  if (!seesSkillMatrices(user)) forbidden();
  const { staff: staffParam } = await searchParams;
  const staffId = Number(typeof staffParam === "string" ? staffParam : "");
  if (!Number.isInteger(staffId) || staffId <= 0) notFound();
  const start = await skillStartFor(user, staffId, nowInMalaysia());
  if (!start) notFound();
  // Already started (by this person or someone else): go to it rather than refuse.
  if (start.existingId) redirect(`/skill-matrix/${start.existingId}`);
  const { staff, quarter } = start;

  return (
    <div>
      <PageHeader
        module="skills"
        context={{ href: "/skill-matrix", label: "Skill matrix" }}
        title={staff.name}
        meta={
          <>
            <span className="num">{staff.staffNo}</span>
            <span>{staff.position ?? DESIGNATION_LABELS[staff.designation]}</span>
            <span>{staff.department.name}</span>
            <span>
              <span className="font-semibold text-ink">{quarterLabel(quarter)}</span> <span className="text-ink-3">· {quarterMonths(quarter)}</span>
            </span>
          </>
        }
      />
      <Panel
        className="max-w-[1100px]"
        title={`Skill matrix for ${quarterLabel(quarter)}`}
        description={`What ${staff.name} knew and could do in ${quarterMonths(quarter)}. Fill it in by ${formatDate(skillQuarterCloses(quarter))}.`}
      >
        {start.blocked ? (
          <div className="flex flex-col items-start gap-3">
            <div className="notice notice-wait">{start.blocked}</div>
            <Link href="/skill-matrix" className="btn">
              Back to the list
            </Link>
          </div>
        ) : (
          <SkillForm action={createSkillMatrixAction.bind(null, staff.id)} initial={null} staffName={staff.name} cancelHref="/skill-matrix" />
        )}
      </Panel>
    </div>
  );
}
