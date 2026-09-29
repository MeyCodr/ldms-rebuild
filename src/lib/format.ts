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
