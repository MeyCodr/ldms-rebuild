import type { Metadata } from "next";
import Link from "next/link";
import { MailCheck } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { ClickableRow } from "@/components/ui/ClickableRow";
import { EmptyState } from "@/components/ui/EmptyState";
import { nowInMalaysia, plural } from "@/lib/format";
import { groupReminders, REMINDER_INFO } from "@/server/rules/reminder";
import { reminderOverview } from "@/server/services/reminder";
import { requirePermission } from "@/server/session";

export const metadata: Metadata = { title: "Who is reminded today" };

/**
 * For L&D: everyone with something waiting on them today, and so everyone the
 * daily job would write a reminder for if it ran now. Each row opens the
 * email that person would get.
 */
export default async function ReminderPeoplePage() {
  const user = await requirePermission("jobs.manage");
  const { people, withEmail } = await reminderOverview(user, nowInMalaysia());

  return (
    <div className="page-fit">
      <PageHeader
        module="jobs"
        context={{ href: "/jobs", label: "Jobs and email" }}
        title="Who is reminded today"
        meta={
          <>
            <span>
              <span className="num font-semibold text-ink">{people.length}</span> {people.length === 1 ? "person has" : "people have"} something waiting
            </span>
            <span>
              <span className="num font-semibold text-ink">{withEmail}</span> with an email address
            </span>
            {people.length > withEmail && <span>{plural(people.length - withEmail, "person", "people")} without one, so not emailed</span>}
          </>
        }
      />

      {people.length === 0 ? (
        <div className="card">
          <EmptyState icon={MailCheck} title="No one has anything waiting">
            Nothing is waiting on anyone today, or every kind of reminder is switched off.
          </EmptyState>
        </div>
      ) : (
        <div className="table-scroll card">
          <table className="table min-w-[820px]" aria-label="People reminded today">
            <thead>
              <tr>
                <th className="w-px text-right whitespace-nowrap">No.</th>
                <th className="min-w-[200px]">Name</th>
                <th className="hidden md:table-cell">Department</th>
                <th>Email</th>
                <th className="w-px text-right whitespace-nowrap">Waiting</th>
                <th className="hidden lg:table-cell">What</th>
              </tr>
            </thead>
            <tbody>
              {people.map((p, i) => {
                const href = `/jobs/reminders/${p.id}`;
                return (
                  <ClickableRow key={p.id} href={href}>
                    <td className="num muted text-right">{i + 1}</td>
                    <td>
                      <Link href={href} className="font-medium text-ink hover:text-accent hover:underline">
                        {p.name}
                      </Link>
                      <div className="num muted text-xs">{p.staffNo}</div>
                    </td>
                    <td className="hidden md:table-cell">{p.department}</td>
                    <td>{p.email ? <span className="break-all">{p.email}</span> : <span className="muted">No email address: not emailed</span>}</td>
                    <td className="num text-right">{p.items.length}</td>
                    <td className="hidden text-[12.5px] text-ink-2 lg:table-cell">
                      {groupReminders(p.items)
                        .map((g) => `${REMINDER_INFO[g.kind].heading} (${g.items.length})`)
                        .join(" · ")}
                    </td>
                  </ClickableRow>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
