import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { formatTime, nowInMalaysia, toDateInput } from "@/lib/format";
import { ojtTrainerOf } from "@/lib/validation/training";
import { isAdmin } from "@/server/permissions";
import { getOjtForEdit } from "@/server/services/ojt";
import { requirePermission } from "@/server/session";
import { OjtEntryForm } from "../../new/OjtEntryForm";

export const metadata: Metadata = { title: "Edit OJT" };

/** The Record OJT form, filled in, for the OJT a record belongs to: its details and who is on it. */
export default async function EditOjtEntryPage({ params }: PageProps<"/ojt/[participantId]/edit">) {
  const user = await requirePermission("ojt.manage");
  const id = Number((await params).participantId);
  if (!Number.isInteger(id)) notFound();
  const found = await getOjtForEdit(user, id);
  if (!found) notFound();
  const t = found.training;
  const back = { href: `/ojt/${id}`, label: t.title };

  if (found.blocked)
    return (
      <div>
        <PageHeader module="ojt" context={back} title="Edit OJT" />
        <div className="flex max-w-[800px] flex-col items-start gap-3">
          <p className="notice notice-wait">{found.blocked}</p>
          <Link href={back.href} className="btn">
            Back to the OJT
          </Link>
        </div>
      </div>
    );

  return (
    <div>
      <PageHeader module="ojt" context={back} title="Edit OJT" meta={<span>Changes apply to everyone on this OJT. Untick someone to take them off it.</span>} />
      <OjtEntryForm
        staff={found.staff}
        departments={found.departments}
        today={toDateInput(nowInMalaysia())}
        contractOnly={!isAdmin(user)}
        edit={{
          participantId: id,
          staffIds: found.staffIds,
          values: {
            title: t.title,
            // Imported OJT has no training type (the template has no column for it): it is plain OJT.
            ojtMethod: t.ojtMethod ?? "OJT",
            startDate: toDateInput(t.startDate),
            endDate: toDateInput(t.endDate),
            startTime: formatTime(t.startTime),
            endTime: formatTime(t.endTime),
            venue: t.venue ?? "",
            trainer: ojtTrainerOf(t.program) ?? "",
            trainerName: t.trainerName ?? "",
          },
        }}
      />
    </div>
  );
}
