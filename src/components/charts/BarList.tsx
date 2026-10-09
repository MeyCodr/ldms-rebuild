// A ranked list of horizontal bars, for comparing named things (departments,
// people) whose names are too long for a column chart's axis. Each row is its
// name, its value in words and a bar against the largest; the text is the
// data, so it needs no separate table for screen readers.

import Link from "next/link";

export type BarRow = {
  key: string | number;
  label: React.ReactNode;
  /** A second line under the label, e.g. the division. */
  sub?: React.ReactNode;
  value: number;
  /** The value as shown, e.g. "12.5 h". */
  text: string;
  /** Smaller text after the value, e.g. "3 trainings". */
  note?: string;
  href?: string;
};

export function BarList({
  rows,
  label,
  color = "bg-accent",
  numbered = false,
  columns = false,
}: {
  rows: BarRow[];
  label: string;
  color?: string;
  numbered?: boolean;
  /** Two columns on a wide screen, reading down the first and then the second. */
  columns?: boolean;
}) {
  const max = Math.max(0, ...rows.map((r) => r.value));
  return (
    <ol aria-label={label} className={columns ? "gap-x-10 lg:columns-2 [&>li]:mb-3.5 [&>li]:break-inside-avoid" : "flex flex-col gap-3.5"}>
      {rows.map((r, i) => {
        const body = (
          <>
            <span className="flex items-baseline justify-between gap-3">
              <span className="flex min-w-0 items-baseline gap-2">
                {numbered && <span className="num w-4 shrink-0 text-right text-xs text-ink-3">{i + 1}</span>}
                <span className="min-w-0">
                  <span className={`block truncate font-medium text-ink ${r.href ? "group-hover:text-accent group-hover:underline" : ""}`}>{r.label}</span>
                  {r.sub && <span className="block truncate text-xs text-ink-3">{r.sub}</span>}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className={`num font-medium ${r.value > 0 ? "text-ink" : "text-ink-3"}`}>{r.text}</span>
                {r.note && <span className="block text-xs text-ink-3">{r.note}</span>}
              </span>
            </span>
            <span className={`mt-1.5 block h-2 rounded-full bg-sunken ${numbered ? "ml-6" : ""}`} aria-hidden>
              {r.value > 0 && max > 0 && <span className={`block h-full rounded-full ${color}`} style={{ width: `max(${(r.value / max) * 100}%, 4px)` }} />}
            </span>
          </>
        );
        return (
          <li key={r.key} className="text-[13px]">
            {r.href ? (
              <Link href={r.href} className="group block">
                {body}
              </Link>
            ) : (
              body
            )}
          </li>
        );
      })}
    </ol>
  );
}
