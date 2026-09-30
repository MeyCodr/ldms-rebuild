import type { Metadata } from "next";
import { PageHeader } from "@/components/PageHeader";
import { internalTrainerOptions } from "@/server/services/training";
import { requirePermission } from "@/server/session";
import { createTrainingAction } from "../actions";
import { TrainingForm } from "../TrainingForm";

export const metadata: Metadata = { title: "Add training" };

export default async function NewTrainingPage() {
  await requirePermission("training.manage");
  const trainers = await internalTrainerOptions();

  return (
    <div className="mx-auto max-w-[1280px]">
      <PageHeader module="training" context={{ href: "/trainings", label: "Trainings" }} title="Add training" />
      <div className="mt-5">
        <TrainingForm
          action={createTrainingAction}
          trainers={trainers}
          submitLabel="Save"
          cancelHref="/trainings"
          initial={{
            type: "",
            title: "",
            venue: "",
            cost: "",
            hrdfClaimable: "",
            platform: "",
            function: "",
            startDate: "",
            endDate: "",
            startTime: "08:30",
            endTime: "17:30",
            program: "",
            trainerStaffId: "",
            trainerName: "",
          }}
        />
        <p className="mt-6 max-w-[760px] text-xs text-ink-3">Participants are added from the training&apos;s page once it is saved.</p>
      </div>
    </div>
  );
}
