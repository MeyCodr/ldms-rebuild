import { withBasePath } from "@/lib/base-path";
import { safeNotificationHref } from "@/server/rules/notification";
import { openNotification } from "@/server/services/notification";
import { getCurrentUser } from "@/server/session";

// In a route handler redirect() doesn't add the app's base path, so the
// address is built here.
const goTo = (path: string) => new Response(null, { status: 307, headers: { Location: withBasePath(path) } });

/**
 * Opening a notification from the list: marks it read, then goes to the
 * record it is about. Only the person it was written for can; anyone else
 * gets 404. The list links here with a plain link, so nothing is marked read
 * by a prefetch.
 */
export async function GET(_request: Request, { params }: RouteContext<"/notifications/[id]/open">) {
  const user = await getCurrentUser();
  if (!user) return goTo("/login");
  if (user.mustChangePassword) return goTo("/account");
  const id = Number((await params).id);
  const href = Number.isInteger(id) ? await openNotification(user, id) : null;
  if (!href) return new Response("Not found", { status: 404 });
  return goTo(safeNotificationHref(href));
}
