import type { Metadata } from "next";
import Link from "next/link";
import { forbidden, notFound } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { Panel } from "@/components/Panel";
import { formatDate, nowInMalaysia } from "@/lib/format";
import { DESIGNATION_LABELS } from "@/lib/validation/staff";
import { quarterLabel, quarterMonths, seesSkillMatrices, skillQuarterCloses } from "@/server/rules/skill";
import { getSkillMatrix } from "@/server/services/skill";
import { requireUser } from "@/server/session";
import { updateSkillMatrixAction } from "../../actions";
import { SkillForm } from "../../SkillForm";

export const metadata: Metadata = { title: "Edit skill matrix" };

export default async function EditSkillMatrixPage({ params }: PageProps<"/skill-matrix/[id]/edit">) {
  const user = await requireUser();
  if (!seesSkillMatrices(user)) forbidden();
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const m = await getSkillMatrix(user, id, nowInMalaysia());
  if (!m) notFound();
  const { staff } = m;

  return (
    <div>
      <PageHeader
        module="skills"
        context={{ href: `/skill-matrix/${m.id}`, label: `${staff.name}'s matrix` }}
        title={staff.name}
        meta={
          <>
            <span className="num">{staff.staffNo}</span>
            <span>{staff.position ?? DESIGNATION_LABELS[staff.designation]}</span>
            <span>{staff.department.name}</span>
            <span>
              <span className="font-semibold text-ink">{quarterLabel(m)}</span> <span className="text-ink-3">· {quarterMonths(m)}</span>
            </span>
          </>
        }
      />
      <Panel
        className="max-w-[1100px]"
        title={`Skill matrix for ${quarterLabel(m)}`}
        description={`What ${staff.name} knew and could do in ${quarterMonths(m)}. Fill it in by ${formatDate(skillQuarterCloses(m))}.`}
      >
        {m.blocked.EDIT ? (
          <div className="flex flex-col items-start gap-3">
            <div className="notice notice-wait">{m.blocked.EDIT}</div>
            <Link href={`/skill-matrix/${m.id}`} className="btn">
              Back to the matrix
            </Link>
          </div>
        ) : (
          <SkillForm
            action={updateSkillMatrixAction.bind(null, m.id)}
            initial={m.content}
            staffName={staff.name}
            cancelHref={`/skill-matrix/${m.id}`}
            returnReason={m.returnReason}
          />
        )}
      </Panel>
    </div>
  );
}
