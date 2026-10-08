import type { Metadata } from "next";
import Link from "next/link";
import { BellOff, CheckCheck, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { withBasePath } from "@/lib/base-path";
import { daysAgo, formatDateTime, nowInMalaysia, plural } from "@/lib/format";
import { RETENTION_DAYS } from "@/server/rules/mail";
import { notificationAsks } from "@/server/rules/notification";
import { myNotifications } from "@/server/services/notification";
import { requireUser } from "@/server/session";
import { markAllReadAction } from "./actions";

export const metadata: Metadata = { title: "Notifications" };

/**
 * The signed-in person's notifications: what happened to their records,
 * newest first. Opening one marks it read and goes to the record. What is
 * waiting on them now is on the overview, under Waiting on you.
 */
export default async function NotificationsPage({ searchParams }: PageProps<"/notifications">) {
  const user = await requireUser();
  const raw = (await searchParams).page;
  const page = Math.max(1, Number(typeof raw === "string" ? raw : "1") || 1);
  const { rows, total, unread, pages } = await myNotifications(user, page);
  const today = nowInMalaysia();

  return (
    <div>
      <PageHeader
        module="notifications"
        context="My work"
        title="Notifications"
        meta={
          total === 0 ? (
            <span>Nothing yet</span>
          ) : (
            <span>
              <span className="num font-semibold text-ink">{unread}</span> unread of {plural(total, "notification")}
            </span>
          )
        }
        actions={
          unread > 0 && (
            <form action={markAllReadAction}>
              <button type="submit" className="btn">
                <CheckCheck size={15} aria-hidden /> Mark all as read
              </button>
            </form>
          )
        }
      />

      <div className="card">
        {rows.length === 0 ? (
          <EmptyState icon={BellOff} title="No notifications">
            You are told here when something happens to one of your records: a TNA approved or sent back, a PME evaluated, a skill matrix sent back. They are kept
            for {RETENTION_DAYS} days.
          </EmptyState>
        ) : (
          <ul aria-label="Notifications" className="divide-y divide-rule">
            {rows.map((n) => (
              <li key={n.id}>
                {/* A plain link, not next/link: opening it marks it read, which a prefetch must not do. */}
                <a
                  href={withBasePath(`/notifications/${n.id}/open`)}
                  className="group flex items-start gap-3 px-5 py-3.5 transition-colors first:rounded-t-xl last:rounded-b-xl hover:bg-sunken/70"
                >
                  <span
                    aria-hidden
                    className={`mt-[7px] size-2 shrink-0 rounded-full ${n.readAt ? "bg-transparent" : notificationAsks(n.kind) ? "bg-wait" : "bg-accent"}`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className={`block text-[13.5px] ${n.readAt ? "text-ink-2" : "font-medium text-ink"}`}>
                      {!n.readAt && <span className="sr-only">Unread: </span>}
                      {n.title}
                    </span>
                    <span className="mt-0.5 block text-xs text-ink-3" title={formatDateTime(n.createdAt)}>
                      {daysAgo(new Date(n.createdAt.getTime() + 8 * 3_600_000), today)} · <span className="num">{formatDateTime(n.createdAt)}</span>
                    </span>
                  </span>
                  <ChevronRight size={16} aria-hidden className="mt-1 shrink-0 text-ink-3 group-hover:text-ink-2" />
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>

      {pages > 1 && (
        <nav aria-label="Pages" className="mt-4 flex items-center justify-between text-[13px] text-ink-2">
          <span>
            Page <span className="num">{page}</span> of <span className="num">{pages}</span>
          </span>
          <span className="flex gap-2">
            {page > 1 && (
              <Link href={`/notifications?page=${page - 1}`} className="btn">
                Newer
              </Link>
            )}
            {page < pages && (
              <Link href={`/notifications?page=${page + 1}`} className="btn">
                Older
              </Link>
            )}
          </span>
        </nav>
      )}
    </div>
  );
}
