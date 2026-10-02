import type { Metadata } from "next";
import { PageHeader } from "@/components/PageHeader";
import { nowInMalaysia, toDateInput } from "@/lib/format";
import { requireUser } from "@/server/session";
import { recordOjtAction } from "../../actions";
import { OjtForm } from "../../OjtForm";

export const metadata: Metadata = { title: "Record OJT" };

export default async function RecordOjtPage() {
  await requireUser();
  const today = toDateInput(nowInMalaysia());
  return (
    <div className="mx-auto max-w-[1660px]">
      <PageHeader
        module="learning"
        context={{ href: "/my-training", label: "My training" }}
        title="Record OJT"
        meta={<span>On-the-job training you did. It goes straight onto your record as completed and its hours count.</span>}
      />
      <OjtForm
        action={recordOjtAction}
        initial={{ title: "", ojtMethod: "", startDate: today, endDate: today, startTime: "08:30", endTime: "17:30", venue: "", trainer: "" }}
        answers={null}
        submitLabel="Record OJT"
        cancelHref="/my-training"
        today={today}
      />
    </div>
  );
}
