import type { Metadata } from "next";
import Link from "next/link";
import { forbidden, notFound } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { Panel } from "@/components/Panel";
import { nowInMalaysia } from "@/lib/format";
import { seesTnis } from "@/server/rules/tni";
import { tnaOpen } from "@/server/services/tna";
import { getTni, tniToCopy } from "@/server/services/tni";
import { requireUser } from "@/server/session";
import { saveTniAction } from "../../actions";
import { TniForm } from "../../TniForm";

export const metadata: Metadata = { title: "Edit TNI" };

/** The form for a department's TNI for this year: a new one (?copy=1 starts from the last one on record), or the one on record. */
export default async function EditTniPage({ params, searchParams }: PageProps<"/tni/[departmentId]/edit">) {
  const user = await requireUser();
  if (!seesTnis(user)) forbidden();
  const departmentId = Number((await params).departmentId);
  if (!Number.isInteger(departmentId)) notFound();
  const today = nowInMalaysia();
  const year = await tnaOpen(today);
  const t = await getTni(user, departmentId, year, today);
  if (!t) notFound();
  const copy = !t.tni && !t.editBlock && (await searchParams).copy === "1" ? await tniToCopy(departmentId, year) : null;
  const back = `/tni/${departmentId}`;

  return (
    <div>
      <PageHeader
        module="tni"
        context={{ href: back, label: `${t.department.name}'s TNI` }}
        title={t.department.name}
        meta={
          <>
            <span>{t.department.division.name}</span>
            <span className="font-semibold text-ink">{year}</span>
          </>
        }
      />
      <Panel
        className="max-w-[1280px]"
        title={`Training Need Identification for ${year}`}
        description={
          copy
            ? `Started from the ${copy.year} TNI. Change what is different this year; nothing is saved until you save.`
            : "Where the department's performance falls short of what is expected, why, and how each gap will be closed."
        }
      >
        {t.editBlock ? (
          <div className="flex flex-col items-start gap-3">
            <div className="notice notice-wait">{t.editBlock}</div>
            <Link href={back} className="btn">
              Back to the TNI
            </Link>
          </div>
        ) : (
          <TniForm action={saveTniAction.bind(null, departmentId)} initial={t.tni ? t.content : (copy?.content ?? [])} cancelHref={back} />
        )}
      </Panel>
    </div>
  );
}
