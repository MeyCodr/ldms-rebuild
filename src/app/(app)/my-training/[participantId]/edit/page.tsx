import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { CURRENT_FORM, type Answers } from "@/lib/forms/feedback";
import { formatTime, nowInMalaysia, toDateInput } from "@/lib/format";
import { ojtTrainerOf } from "@/lib/validation/training";
import { ojtDetailsBlock } from "@/server/rules/myTraining";
import { myParticipant } from "@/server/services/myTraining";
import { requireUser } from "@/server/session";
import { updateOjtAction } from "../../actions";
import { AnswersForm } from "../../AnswersForm";
import { OjtForm } from "../../OjtForm";

export const metadata: Metadata = { title: "Edit OJT" };

/**
 * One place to change a completed OJT. The person's own OJT: the whole form
 * (details and answers). An OJT from their clerk or L&D: their answers only,
 * since the details may be shared with others.
 */
export default async function EditOjtPage({ params }: PageProps<"/my-training/[participantId]/edit">) {
  const user = await requireUser();
  const id = Number((await params).participantId);
  if (!Number.isInteger(id)) notFound();
  const today = nowInMalaysia();
  const r = await myParticipant(user, id, today);
  if (!r || r.kind !== "OJT") notFound();
  const t = r.training;
  const answers = (r.feedback ?? null) as Answers | null;
  const whole = r.access.mode === "update" && !ojtDetailsBlock(r, r.others);
  const back = { href: `/my-training/${id}`, label: t.title };

  if (r.access.mode !== "update")
    return (
      <div>
        <PageHeader module="learning" context={back} title="Edit OJT" />
        <div className="flex max-w-[800px] flex-col items-start gap-3">
          <p className="notice notice-wait">
            {r.access.mode === "closed" ? r.access.reason : "This OJT is waiting for your answers. Give them on its page; that completes it."}
          </p>
          <Link href={back.href} className="btn">
            Back to the OJT
          </Link>
        </div>
      </div>
    );

  return (
    <div>
      <PageHeader
        module="learning"
        context={back}
        title={whole ? "Edit OJT" : "Edit answers"}
        meta={!whole && <span>Your clerk or the L&amp;D unit recorded this OJT, so you can change your answers but not its details.</span>}
      />
      {whole ? (
        <OjtForm
          action={updateOjtAction.bind(null, id)}
          initial={{
            title: t.title,
            ojtMethod: t.ojtMethod ?? "",
            startDate: toDateInput(t.startDate),
            endDate: toDateInput(t.endDate),
            startTime: formatTime(t.startTime),
            endTime: formatTime(t.endTime),
            venue: t.venue ?? "",
            trainer: ojtTrainerOf(t.program) ?? "",
          }}
          answers={answers}
          submitLabel="Save changes"
          cancelHref={back.href}
          today={toDateInput(today)}
        />
      ) : (
        <div className="card max-w-[860px] p-5 sm:p-7">
          <AnswersForm participantId={id} form={CURRENT_FORM.OJT} initial={answers} submitLabel="Save answers" cancelHref={back.href} />
        </div>
      )}
    </div>
  );
}
