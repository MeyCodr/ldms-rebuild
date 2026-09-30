import { formatDateTime } from "@/lib/format";
import { Panel } from "./Panel";

type Entry = { id: bigint; createdAt: Date; summary: string; changes: unknown; actor: { name: string } | null };

/**
 * How a record's audited fields read in plain language: a label, an optional
 * formatter for values, or hidden when another field already says the same.
 */
export type HistoryFields = Record<string, { label: string; format?: (value: unknown) => string } | { hidden: true }>;

/** The latest audit entries for one record, with field-level changes. */
export function HistoryPanel({ entries, fields = {} }: { entries: Entry[]; fields?: HistoryFields }) {
  if (entries.length === 0) return null;
  return (
    <Panel title="History" flush>
      <ol className="px-5 text-[13px]">
        {entries.map((h) => {
          const changes =
            h.changes && typeof h.changes === "object" && !Array.isArray(h.changes)
              ? Object.entries(h.changes as Record<string, [unknown, unknown]>).filter(([k]) => !(fields[k] && "hidden" in fields[k]))
              : [];
          return (
            <li key={String(h.id)} className="grid gap-x-4 border-b border-rule py-2.5 last:border-b-0 sm:grid-cols-[150px_1fr]">
              <div className="num text-xs text-ink-3 sm:pt-0.5">{formatDateTime(h.createdAt)}</div>
              <div className="min-w-0 break-words">
                {h.summary}
                <span className="text-ink-3"> · {h.actor?.name ?? "System"}</span>
                {changes.length > 0 && (
                  <ul className="mt-0.5 text-xs text-ink-2">
                    {changes.map(([k, [a, b]]) => {
                      const field = fields[k] && !("hidden" in fields[k]) ? fields[k] : undefined;
                      const show = (v: unknown) => (v === null || v === undefined || v === "" ? "blank" : field?.format ? field.format(v) : String(v));
                      return (
                        <li key={k}>
                          {field?.label ?? k}: <span className="text-ink-3">{show(a)}</span> → {show(b)}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </Panel>
  );
}
