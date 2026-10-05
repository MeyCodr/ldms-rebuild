import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { formatTime, toDateInput } from "@/lib/format";
import { getTraining, internalTrainerOptions } from "@/server/services/training";
import { requirePermission } from "@/server/session";
import { updateTrainingAction } from "../../actions";
import { TrainingForm } from "../../TrainingForm";

export const metadata: Metadata = { title: "Edit training" };

export default async function EditTrainingPage({ params }: PageProps<"/trainings/[id]/edit">) {
  const user = await requirePermission("training.manage");
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const t = await getTraining(user, id);
  if (!t) notFound();
  const trainers = await internalTrainerOptions(t.trainerStaffId);

  return (
    <div>
      <PageHeader module="training" context={{ href: `/trainings/${id}`, label: t.title }} title="Edit training" />
      {t.participantCount > 0 && (
        <div className="notice notice-wait mt-4 max-w-[760px]">
          {t.participantCount === 1 ? "1 person is" : `${t.participantCount} people are`} on this training. Changing the dates or times changes
          the hours they are credited with.
        </div>
      )}
      {t.sessions.length > 0 && (
        <div className="notice notice-wait mt-4 max-w-[760px]">
          This training runs in {t.sessions.length} separate sessions. Saving replaces them with the start and end dates and times below, so
          check the hours before you save.
        </div>
      )}
      <div className="mt-5">
        <TrainingForm
          action={updateTrainingAction.bind(null, id)}
          trainers={trainers}
          submitLabel="Save changes"
          cancelHref={`/trainings/${id}`}
          initial={{
            type: t.type,
            title: t.title,
            venue: t.venue ?? "",
            cost: t.cost === null ? "" : t.cost.toFixed(2),
            hrdfClaimable: t.hrdfClaimable ? "yes" : "no",
            platform: t.platform ?? "",
            function: t.function ?? "",
            startDate: toDateInput(t.startDate),
            endDate: toDateInput(t.endDate),
            startTime: formatTime(t.startTime),
            endTime: formatTime(t.endTime),
            program: t.program ?? "",
            trainerStaffId: t.trainerStaffId ?? "",
            trainerName: t.trainerStaffId ? "" : (t.trainerName ?? ""),
          }}
        />
      </div>
    </div>
  );
}
