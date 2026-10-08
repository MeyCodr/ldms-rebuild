import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "../db";
import type { SessionUser } from "../permissions";
import { notificationsToWrite, type NewNotification } from "../rules/notification";

// Notifications: a person's list of what happened to their records (see
// rules/notification.ts). Written by the PME, skill matrix and TNA services
// inside the transaction of the change they report. Everyone reads and marks
// only their own. The daily job removes those older than 90 days.

type Tx = Prisma.TransactionClient;

/** Writes the notifications of one change. Call inside its transaction. The person who made the change is never told. */
export async function notify(tx: Tx, actorId: number, list: (NewNotification | null)[]) {
  const data = notificationsToWrite(list, actorId);
  if (data.length) await tx.notification.createMany({ data });
}

/** A record that is deleted takes its notifications with it: they would lead nowhere. Call inside the deletion's transaction. */
export async function forgetNotifications(tx: Tx, entity: NewNotification["entity"], ids: number[]) {
  if (ids.length) await tx.notification.deleteMany({ where: { entity, entityId: { in: ids } } });
}

export async function unreadNotificationCount(user: SessionUser): Promise<number> {
  return db.notification.count({ where: { staffId: user.id, readAt: null } });
}

export const NOTIFICATION_PAGE_SIZE = 50;

/** The person's own list, newest first. */
export async function myNotifications(user: SessionUser, page = 1) {
  const where = { staffId: user.id };
  const [rows, total, unread] = await Promise.all([
    db.notification.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (Math.max(1, page) - 1) * NOTIFICATION_PAGE_SIZE,
      take: NOTIFICATION_PAGE_SIZE,
      select: { id: true, kind: true, title: true, createdAt: true, readAt: true },
    }),
    db.notification.count({ where }),
    db.notification.count({ where: { ...where, readAt: null } }),
  ]);
  return { rows, total, unread, pages: Math.max(1, Math.ceil(total / NOTIFICATION_PAGE_SIZE)) };
}

/** Opening one from the list: marks it read and says where it leads. Null when it isn't this person's. */
export async function openNotification(user: SessionUser, id: number): Promise<string | null> {
  const n = await db.notification.findFirst({ where: { id, staffId: user.id }, select: { href: true, readAt: true } });
  if (!n) return null;
  if (!n.readAt) await db.notification.updateMany({ where: { id, staffId: user.id, readAt: null }, data: { readAt: new Date() } });
  return n.href;
}

/** Marks all of the person's notifications read. Returns how many were unread. */
export async function markAllNotificationsRead(user: SessionUser): Promise<number> {
  const done = await db.notification.updateMany({ where: { staffId: user.id, readAt: null }, data: { readAt: new Date() } });
  return done.count;
}
