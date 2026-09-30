const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** 03 Apr 2017. Unambiguous for staff used to both DD/MM and MM/DD. */
export function formatDate(d: Date | null | undefined): string {
  if (!d) return "";
  return `${String(d.getUTCDate()).padStart(2, "0")} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** Local time in Malaysia, for timestamps such as audit entries. */
export function formatDateTime(d: Date | null | undefined): string {
  if (!d) return "";
  const local = new Date(d.getTime() + 8 * 60 * 60 * 1000);
  return `${formatDate(local)}, ${String(local.getUTCHours()).padStart(2, "0")}:${String(local.getUTCMinutes()).padStart(2, "0")}`;
}

export function toDateInput(d: Date | null | undefined): string {
  return d ? d.toISOString().slice(0, 10) : "";
}

export function yearsOfService(joined: Date | null, until: Date | null): string {
  if (!joined) return "";
  const end = until ?? new Date();
  const months = (end.getUTCFullYear() - joined.getUTCFullYear()) * 12 + (end.getUTCMonth() - joined.getUTCMonth());
  if (months < 12) return `${Math.max(months, 0)} mo`;
  const y = Math.floor(months / 12);
  const m = months % 12;
  return m ? `${y} yr ${m} mo` : `${y} yr`;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString("en-MY")} ${n === 1 ? one : many}`;
}

/** Now, shifted to Malaysia time (UTC+8), for "today" in dates and defaults. */
export function nowInMalaysia(): Date {
  return new Date(Date.now() + 8 * 60 * 60 * 1000);
}

/** 9 h, 12.5 h, 1.25 h. Hours come from trainingHours(), already rounded. */
export function formatHours(hours: number | null | undefined): string {
  if (hours === null || hours === undefined) return "";
  return `${hours.toLocaleString("en-MY", { maximumFractionDigits: 2 })} h`;
}

/** 08:30, from a Prisma @db.Time value (a Date on 1970-01-01 UTC). */
export function formatTime(t: Date | null | undefined): string {
  if (!t) return "";
  return `${String(t.getUTCHours()).padStart(2, "0")}:${String(t.getUTCMinutes()).padStart(2, "0")}`;
}

/** 03 Apr 2026, or 03 – 05 Apr 2026, or 30 Mar – 02 Apr 2026. */
export function formatDateRange(start: Date, end: Date): string {
  if (start.getTime() === end.getTime()) return formatDate(start);
  const [sd, sm, sy] = formatDate(start).split(" ");
  if (sy !== String(end.getUTCFullYear())) return `${formatDate(start)} – ${formatDate(end)}`;
  if (sm !== MONTHS[end.getUTCMonth()]) return `${sd} ${sm} – ${formatDate(end)}`;
  return `${sd} – ${formatDate(end)}`;
}

/** RM 1,250.00 */
export function formatMoney(amount: { toString(): string } | null | undefined): string {
  if (amount === null || amount === undefined) return "";
  return `RM ${Number(amount.toString()).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
