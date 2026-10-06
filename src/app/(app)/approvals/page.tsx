import type { Metadata } from "next";
import Link from "next/link";
import { forbidden } from "next/navigation";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Panel } from "@/components/Panel";
import { ClickableRow } from "@/components/ui/ClickableRow";
import { EmptyState } from "@/components/ui/EmptyState";
import { Status } from "@/components/ui/Status";
import { daysAgo, formatDate, formatDateRange, formatDateTime, nowInMalaysia, plural } from "@/lib/format";
import { can, hasApprovals, isHod } from "@/server/permissions";
import { pmeOpensOn } from "@/server/rules/pme";
import { pmeStageCounts, pmeWaiting, type PmeView } from "@/server/services/pme";
import { requireUser } from "@/server/session";
import { formatMark } from "../pme/labels";

export const metadata: Metadata = { title: "Approvals" };

/**
 * Everything waiting on the signed-in person, the longest-waiting first.
 * PMEs for now; skill matrices and TNAs join as those modules open.
 */
export default async function ApprovalsPage() {
  const user = await requireUser();
  if (!hasApprovals(user)) forbidden();
  const today = nowInMalaysia();
  const hod = isHod(user);
  const verifies = can(user, "pme.verify");
  const [waiting, counts] = await Promise.all([pmeWaiting(user, today), hod ? pmeStageCounts(user, today) : null]);
  const total = waiting.toEvaluate.length + waiting.toVerify.length;

  return (
    <div>
      <PageHeader
        module="approvals"
        context="Team"
        title="Approvals"
        meta={total > 0 ? <Status tone="wait">{plural(total, "record")} waiting for you</Status> : <Status tone="ok">Nothing waiting for you</Status>}
      />

      <div className="flex flex-col gap-5">
        {total === 0 && (
          <div className="card">
            <EmptyState icon={CheckCircle2} title="You're up to date">
              {hod && verifies
                ? "PMEs to evaluate or verify show here when they're ready."
                : hod
                  ? "Your staff's PMEs show here when their three-month evaluation period ends."
                  : "PMEs show here once the staff member has acknowledged their HOD's evaluation."}
            </EmptyState>
          </div>
        )}

        {waiting.toEvaluate.length > 0 && (
          <Panel
            title="PMEs to evaluate"
            description="Your staff whose evaluation period has ended, the longest-waiting first"
            action={<Status tone="wait">{waiting.toEvaluate.length} to do</Status>}
            flush
          >
            <div className="overflow-x-auto">
              <table className="table min-w-[720px]" aria-label="PMEs to evaluate">
                <thead>
                  <tr>
                    <th className="w-px pl-5 text-right whitespace-nowrap">No.</th>
                    <th className="min-w-[180px]">Staff</th>
                    <th className="min-w-[200px]">Training</th>
                    <th className="w-px whitespace-nowrap">Training dates</th>
                    <th className="w-px whitespace-nowrap">Waiting since</th>
                    <th className="w-px pr-5">
                      <span className="sr-only">Action</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {waiting.toEvaluate.map((p, i) => (
                    <ClickableRow key={p.id} href={`/pme/${p.id}`}>
                      <td className="num muted pl-5 text-right">{i + 1}</td>
                      <td>
                        <Staff p={p} />
                      </td>
                      <td>
                        {p.training.title}
                        {p.returnReason && <div className="muted text-xs">Sent back by L&amp;D: {p.returnReason}</div>}
                      </td>
                      <td className="num whitespace-nowrap">{formatDateRange(p.training.startDate, p.training.endDate)}</td>
                      <td className="whitespace-nowrap">
                        <span className="num">{formatDate(pmeOpensOn(p))}</span>
                        <div className="muted text-xs">{daysAgo(pmeOpensOn(p), today)}</div>
                      </td>
                      <td className="pr-5 text-right">
                        <Link href={`/pme/${p.id}`} className="btn btn-primary btn-sm whitespace-nowrap">
                          Evaluate <ArrowRight size={14} aria-hidden />
                        </Link>
                      </td>
                    </ClickableRow>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        )}

        {waiting.toVerify.length > 0 && (
          <Panel
            title="PMEs to verify"
            description="Evaluated by the HOD and acknowledged by the staff member, the longest-waiting first"
            action={<Status tone="wait">{waiting.toVerify.length} to do</Status>}
            flush
          >
            <div className="overflow-x-auto">
              <table className="table min-w-[820px]" aria-label="PMEs to verify">
                <thead>
                  <tr>
                    <th className="w-px pl-5 text-right whitespace-nowrap">No.</th>
                    <th className="min-w-[180px]">Staff</th>
                    <th className="hidden md:table-cell">Department</th>
                    <th className="min-w-[200px]">Training</th>
                    <th className="w-px whitespace-nowrap">Evaluated by</th>
                    <th className="w-px text-right whitespace-nowrap">Mark</th>
                    <th className="w-px whitespace-nowrap">Acknowledged</th>
                    <th className="w-px pr-5">
                      <span className="sr-only">Action</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {waiting.toVerify.map((p, i) => (
                    <ClickableRow key={p.id} href={`/pme/${p.id}`}>
                      <td className="num muted pl-5 text-right">{i + 1}</td>
                      <td>
                        <Staff p={p} />
                      </td>
                      <td className="hidden md:table-cell">{p.staff.department}</td>
                      <td>{p.training.title}</td>
                      <td className="whitespace-nowrap">{p.evaluatedBy?.name ?? <span className="muted">–</span>}</td>
                      <td className="num text-right font-medium">{p.mark ? formatMark(p.mark.average) : <span className="muted">–</span>}</td>
                      <td className="num whitespace-nowrap">
                        {p.acknowledgedAt ? formatDateTime(p.acknowledgedAt).split(",")[0] : <span className="muted">Resigned before acknowledging</span>}
                      </td>
                      <td className="pr-5 text-right">
                        <Link href={`/pme/${p.id}`} className="btn btn-primary btn-sm whitespace-nowrap">
                          Verify <ArrowRight size={14} aria-hidden />
                        </Link>
                      </td>
                    </ClickableRow>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        )}

        {counts && (counts.IN_PERIOD > 0 || counts.TO_ACKNOWLEDGE > 0 || counts.TO_VERIFY > 0) && (
          <p className="px-1 text-[13px] text-ink-2">
            Not waiting for you:{" "}
            {[
              counts.IN_PERIOD > 0 && { stage: "IN_PERIOD", text: `${plural(counts.IN_PERIOD, "PME")} still in the evaluation period` },
              counts.TO_ACKNOWLEDGE > 0 && { stage: "TO_ACKNOWLEDGE", text: `${counts.TO_ACKNOWLEDGE} waiting for staff to acknowledge` },
              !verifies && counts.TO_VERIFY > 0 && { stage: "TO_VERIFY", text: `${counts.TO_VERIFY} waiting for L&D to verify` },
            ]
              .filter((x): x is { stage: string; text: string } => !!x)
              .map((x, i) => (
                <span key={x.stage}>
                  {i > 0 && ", "}
                  <Link href={`/pme?stage=${x.stage}`} className="link">
                    {x.text}
                  </Link>
                </span>
              ))}
            .
          </p>
        )}
      </div>
    </div>
  );
}

function Staff({ p }: { p: PmeView }) {
  return (
    <>
      <Link href={`/pme/${p.id}`} className="font-medium text-ink hover:text-accent hover:underline">
        {p.staff.name}
      </Link>
      <div className="muted text-xs">
        <span className="num">{p.staff.staffNo}</span>
        {p.staff.position && <> · {p.staff.position}</>}
      </div>
    </>
  );
}
