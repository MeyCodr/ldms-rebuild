// What people type into date and time fields, turned into the values forms
// submit (YYYY-MM-DD and HH:MM). Staff are used to day-first dates, so
// "03/04/2026" is 3 April.

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

const pad = (n: number) => String(n).padStart(2, "0");

/** YYYY-MM-DD for a real calendar date, otherwise null. */
function isoDate(y: number, m: number, d: number): string | null {
  if (y < 1900 || y > 2099 || m < 1 || m > 12 || d < 1) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCMonth() !== m - 1) return null; // e.g. 31 April
  return `${y}-${pad(m)}-${pad(d)}`;
}

const fullYear = (y: string) => (y.length === 2 ? 2000 + Number(y) : Number(y));

/**
 * Accepts 3/4/2026, 03-04-2026, 3.4.26, 03042026, 2026-04-03 and 3 Apr 2026.
 * Returns YYYY-MM-DD, or null when the text is not a real date.
 */
export function parseDateInput(text: string): string | null {
  const s = text.trim().toLowerCase();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) return isoDate(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})[/.\-\s](\d{1,2})[/.\-\s](\d{2}|\d{4})$/.exec(s);
  if (m) return isoDate(fullYear(m[3]), Number(m[2]), Number(m[1]));
  m = /^(\d{2})(\d{2})(\d{4})$/.exec(s);
  if (m) return isoDate(Number(m[3]), Number(m[2]), Number(m[1]));
  m = /^(\d{1,2})\s*([a-z]{3,9})\s*,?\s*(\d{2}|\d{4})$/.exec(s);
  if (m) {
    const month = MONTHS.indexOf(m[2].slice(0, 3)) + 1;
    return month ? isoDate(fullYear(m[3]), month, Number(m[1])) : null;
  }
  return null;
}

/** 2026-04-03 → 03/04/2026, the form a date is shown in once typed. */
export function formatDateInput(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

/**
 * Accepts 8:30, 08.30, 0830, 830, 8, 8:30pm, 8pm, 12am and 17:30:00.
 * Returns HH:MM (24-hour), or null when the text is not a valid time.
 */
export function parseTimeInput(text: string): string | null {
  const s = text.trim().toLowerCase().replace(/\s+/g, "");
  const m = /^(\d{1,2})(?:[:.h]?(\d{2}))?(?::\d{2})?(am|pm|a|p)?$/.exec(s);
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  const meridiem = m[3]?.[0];
  if (meridiem) {
    if (h < 1 || h > 12) return null;
    if (meridiem === "a") h = h === 12 ? 0 : h;
    else h = h === 12 ? 12 : h + 12;
  }
  if (h > 23 || min > 59) return null;
  return `${pad(h)}:${pad(min)}`;
}

/** Times offered in the time picker: every 15 minutes. */
export const TIME_SLOTS: string[] = Array.from({ length: 96 }, (_, i) => `${pad(Math.floor(i / 4))}:${pad((i % 4) * 15)}`);
