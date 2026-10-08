import type { Metadata } from "next";
import Link from "next/link";
import { forbidden, notFound, redirect } from "next/navigation";
import { Copy } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Status } from "@/components/ui/Status";
import { nowInMalaysia } from "@/lib/format";
import { can } from "@/server/permissions";
import { seesTeamTnas, TNA_STAGE_LABELS, TNA_STAGE_TONE } from "@/server/rules/tna";
import { getTna, tnaGradeHeadcount, tnaHistory, tnaOpen, tnaStartFor, tnaTrainingHours } from "@/server/services/tna";
import { requireUser } from "@/server/session";
import { TnaBody, TnaHeaderActions, TnaNotices } from "../TnaRecord";

export const metadata: Metadata = { title: "TNA" };

/** One TNA, as its HOD, the main clerk, the division head or L&D see it. The person it is about sees it on My TNA. */
export default async function TnaRecordPage({ params, searchParams }: PageProps<"/tna/[id]">) {
  const user = await requireUser();
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const today = nowInMalaysia();
  const open = await tnaOpen(today);
  const t = await getTna(user, id, today);
  if (t?.viewer.isOwner) redirect(t.year === open ? "/my-tna" : `/my-tna?year=${t.year}`);
  if (!seesTeamTnas(user)) forbidden();
  if (!t) notFound();

  const target = t.staff ? { staffId: t.staff.id } : { departmentId: t.department.id, jobGrade: t.jobGrade! };
  const [hours, history, headcount, next] = await Promise.all([
    t.staff ? tnaTrainingHours(t.staff.id, t.year) : null,
    can(user, "audit.view") ? tnaHistory(id) : [],
    t.staff ? null : tnaGradeHeadcount(t.department.id, t.jobGrade!),
    // From an earlier year: whether this year's can be started from it.
    t.year < open && t.content.length > 0 ? tnaStartFor(user, target, today) : null,
  ]);
  const view = t.staff ? "staff" : "grade";
  const back = `/tna?view=${view}${t.year === open ? "" : `&year=${t.year}`}`;
  const newHref = t.staff ? `/tna/new?staff=${t.staff.id}&copy=1` : `/tna/new?department=${t.department.id}&grade=${t.jobGrade}&copy=1`;

  return (
    <div>
      <PageHeader
        module="tna"
        context={{ href: back, label: "TNA" }}
        title={t.staff ? t.staff.name : `Job grade ${t.jobGrade}`}
        meta={
          <>
            {t.staff && <span className="num">{t.staff.staffNo}</span>}
            <span>{t.department.name}</span>
            <span className="font-semibold text-ink">{t.year}</span>
            <Status tone={TNA_STAGE_TONE[t.stage]}>{TNA_STAGE_LABELS[t.stage]}</Status>
          </>
        }
        actions={
          <>
            <TnaHeaderActions t={t} editHref={`/tna/${t.id}/edit`} />
            {next && next.blocked === null && (
              <Link href={newHref} className="btn btn-primary">
                <Copy size={14} aria-hidden /> Start {open}&apos;s from this
              </Link>
            )}
          </>
        }
      />
      <TnaNotices t={t} saved={(await searchParams).saved} open={open} />
      <TnaBody t={t} user={user} hours={hours} history={history} headcount={headcount} />
    </div>
  );
}
