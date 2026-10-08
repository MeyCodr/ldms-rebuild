import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { Panel } from "@/components/Panel";
import { nowInMalaysia } from "@/lib/format";
import { myTna, myTnaInfo, tnaFormOptions, tnaOpen, tnaStartFor, tnaToCopy } from "@/server/services/tna";
import { requireUser } from "@/server/session";
import { createTnaAction, updateTnaAction } from "../../tna/actions";
import { TnaForm } from "../../tna/TnaForm";

export const metadata: Metadata = { title: "My TNA" };

/** The form for the signed-in person's own TNA for this year: a new one (?copy=1 starts from their last one), or the one on record. */
export default async function EditMyTnaPage({ searchParams }: PageProps<"/my-tna/edit">) {
  const user = await requireUser();
  const today = nowInMalaysia();
  const year = await tnaOpen(today);
  const [info, t] = await Promise.all([myTnaInfo(user), myTna(user, year, today)]);
  const start = t ? null : await tnaStartFor(user, { staffId: user.id }, today);
  const blocked = t ? t.blocked.EDIT : (info.block ?? start?.blocked ?? null);
  const copy = !t && !blocked && (await searchParams).copy === "1" ? await tnaToCopy({ staffId: user.id, departmentId: user.departmentId }, null, year) : null;
  const initial = t?.content ?? copy?.content ?? null;
  const options = await tnaFormOptions((initial ?? []).map((r) => r.optionId).filter((id): id is number => id !== null));

  return (
    <div>
      <PageHeader module="tna" context={{ href: "/my-tna", label: "My TNA" }} title={`My TNA for ${year}`} meta={<span>{user.departmentName}</span>} />
      <Panel
        className="max-w-[1280px]"
        title="Training Need Analysis"
        description={copy ? `Started from your ${copy.year} TNA. Change what is different this year; nothing is saved until you save.` : "The training you need this year, for your HOD to approve."}
      >
        {blocked ? (
          <div className="flex flex-col items-start gap-3">
            <div className="notice notice-wait">{blocked}</div>
            <Link href="/my-tna" className="btn">
              Back to My TNA
            </Link>
          </div>
        ) : (
          <TnaForm
            action={t ? updateTnaAction.bind(null, t.id) : createTnaAction.bind(null, { staffId: user.id })}
            initial={initial}
            options={options}
            year={year}
            cancelHref="/my-tna"
            returnReason={t?.returnReason}
            withHod={t?.status === "SUBMITTED"}
            canKeepWaiting
          />
        )}
      </Panel>
    </div>
  );
}
