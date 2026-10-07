import type { Metadata } from "next";
import Link from "next/link";
import { forbidden, notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { Panel } from "@/components/Panel";
import { nowInMalaysia } from "@/lib/format";
import { seesTeamTnas, tnaTitle } from "@/server/rules/tna";
import { getTna, tnaFormOptions } from "@/server/services/tna";
import { requireUser } from "@/server/session";
import { updateTnaAction } from "../../actions";
import { TnaForm } from "../../TnaForm";

export const metadata: Metadata = { title: "Edit TNA" };

/** The form again, for a TNA someone other than its owner may change: the main clerk's job grades, the HOD before approving, L&D. */
export default async function EditTnaPage({ params }: PageProps<"/tna/[id]/edit">) {
  const user = await requireUser();
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const t = await getTna(user, id, nowInMalaysia());
  if (t?.viewer.isOwner) redirect("/my-tna/edit");
  if (!seesTeamTnas(user)) forbidden();
  if (!t) notFound();
  const options = await tnaFormOptions(t.content.map((r) => r.optionId).filter((o): o is number => o !== null));
  const withHod = t.status === "SUBMITTED";

  return (
    <div>
      <PageHeader
        module="tna"
        context={{ href: `/tna/${t.id}`, label: t.staff ? `${t.staff.name}'s TNA` : `Job grade ${t.jobGrade}'s TNA` }}
        title={t.staff ? t.staff.name : `Job grade ${t.jobGrade}`}
        meta={
          <>
            {t.staff && <span className="num">{t.staff.staffNo}</span>}
            <span>{t.department.name}</span>
            <span className="font-semibold text-ink">{t.year}</span>
          </>
        }
      />
      <Panel
        className="max-w-[1280px]"
        title={`Training Need Analysis for ${t.year}`}
        description={
          withHod
            ? `Change ${tnaTitle(t.owner)} before approving it. It stays waiting for approval.`
            : t.staff
              ? `The training ${t.staff.name} needs this year.`
              : `The training that ${t.department.name}'s staff on job grade ${t.jobGrade} need this year.`
        }
      >
        {t.blocked.EDIT ? (
          <div className="flex flex-col items-start gap-3">
            <div className="notice notice-wait">{t.blocked.EDIT}</div>
            <Link href={`/tna/${t.id}`} className="btn">
              Back to the TNA
            </Link>
          </div>
        ) : (
          <TnaForm
            action={updateTnaAction.bind(null, t.id)}
            initial={t.content}
            options={options}
            year={t.year}
            cancelHref={`/tna/${t.id}`}
            returnReason={t.returnReason}
            withHod={withHod}
          />
        )}
      </Panel>
    </div>
  );
}
