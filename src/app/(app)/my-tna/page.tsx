import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, Copy, Plus } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Status } from "@/components/ui/Status";
import { nowInMalaysia } from "@/lib/format";
import { can } from "@/server/permissions";
import { parseTnaYear, TNA_STAGE_LABELS, TNA_STAGE_TONE } from "@/server/rules/tna";
import { myTna, myTnaInfo, tnaHistory, tnaOpen, tnaTrainingHours } from "@/server/services/tna";
import { requireUser } from "@/server/session";
import { TnaBody, TnaHeaderActions, TnaNotices } from "../tna/TnaRecord";

export const metadata: Metadata = { title: "My TNA" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/**
 * The signed-in person's own Training Need Analysis: this year's, to fill in
 * and send to their HOD, and earlier years' to look back at. People whose
 * needs are recorded another way are told how.
 */
export default async function MyTnaPage({ searchParams }: PageProps<"/my-tna">) {
  const user = await requireUser();
  const today = nowInMalaysia();
  const sp = await searchParams;
  const open = await tnaOpen(today);
  const year = parseTnaYear(one(sp.year)) ?? open;
  const [info, t] = await Promise.all([myTnaInfo(user), myTna(user, year, today)]);
  const [hours, history] = await Promise.all([t ? tnaTrainingHours(user.id, year) : null, t && can(user, "audit.view") ? tnaHistory(t.id) : []]);
  const earlier = info.years.filter((y) => y.year !== year);
  const hasOpen = info.years.some((y) => y.year === open);
  // What "Start from an earlier year's" would copy: the latest earlier TNA with rows.
  const copyFrom = info.years.find((y) => y.year < open && y._count.items > 0);
  const canStart = !info.block && !hasOpen;

  return (
    <div>
      <PageHeader
        module="tna"
        context="My work"
        title="My TNA"
        meta={
          <>
            <span className="font-semibold text-ink">{year}</span>
            {t ? <Status tone={TNA_STAGE_TONE[t.stage]}>{TNA_STAGE_LABELS[t.stage]}</Status> : !info.block && year === open && <Status tone="na">Not started</Status>}
            {t?.approver && t.status !== "APPROVED" && <span>HOD: {t.approver.name}</span>}
          </>
        }
        actions={
          <>
            {t && <TnaHeaderActions t={t} editHref="/my-tna/edit" />}
            {/* Looking at an earlier year with nothing started for this one yet: carry it forward. */}
            {t && year !== open && canStart && t.content.length > 0 && (
              <Link href="/my-tna/edit?copy=1" className="btn btn-primary">
                <Copy size={14} aria-hidden /> Start {open}&apos;s from this
              </Link>
            )}
          </>
        }
      />

      {one(sp.deleted) === "1" && (
        <div role="status" className="notice notice-ok mb-5">
          Draft deleted.
        </div>
      )}

      {t ? (
        <>
          <TnaNotices t={t} saved={sp.saved} open={open} />
          <TnaBody t={t} user={user} hours={hours} history={history} />
        </>
      ) : info.block ? (
        <div className="card">
          <EmptyState icon={BookOpen} title="You don't fill in a TNA of your own">
            {info.block}
          </EmptyState>
        </div>
      ) : year === open ? (
        <div className="card">
          <EmptyState
            icon={BookOpen}
            title={`Your TNA for ${open} hasn't been started`}
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Link href="/my-tna/edit" className="btn btn-primary">
                  <Plus size={14} aria-hidden /> Start my TNA
                </Link>
                {copyFrom && (
                  <Link href="/my-tna/edit?copy=1" className="btn">
                    <Copy size={14} aria-hidden /> Start from {copyFrom.year}&apos;s
                  </Link>
                )}
              </div>
            }
          >
            List the training you need in {open}, with your immediate superior. Your HOD
            {info.staff.department.hod?.status === "ACTIVE" ? `, ${info.staff.department.hod.name},` : ""} approves it.
          </EmptyState>
        </div>
      ) : (
        <div className="card">
          <EmptyState icon={BookOpen} title={`No TNA on record for ${year}`}>
            <Link href="/my-tna" className="link">
              Back to {open}
            </Link>
          </EmptyState>
        </div>
      )}

      {earlier.length > 0 && (
        <p className="mt-5 px-1 text-[13px] text-ink-2">
          Other years:{" "}
          {earlier.map((y, i) => (
            <span key={y.year}>
              {i > 0 && ", "}
              <Link href={y.year === open ? "/my-tna" : `/my-tna?year=${y.year}`} className="link">
                {y.year}
              </Link>{" "}
              <span className="text-ink-3">({TNA_STAGE_LABELS[y.stage].toLowerCase()})</span>
            </span>
          ))}
          .
        </p>
      )}
    </div>
  );
}
