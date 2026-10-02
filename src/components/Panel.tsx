// The card every screen is built from: white, hairline border, 12px corners.
// The title sits in the card without a rule under it; only edge-to-edge
// (flush) content such as a table gets a rule between title and rows.

export function Panel({
  title,
  description,
  action,
  children,
  className = "",
  flush = false,
}: {
  title: React.ReactNode;
  /** One line under the title saying what the card shows. */
  description?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** No inner padding, for lists and tables that run edge to edge. */
  flush?: boolean;
}) {
  return (
    // min-w-0: in a grid, a card shrinks to its column rather than growing to fit a long title.
    <section className={`card flex min-w-0 flex-col ${className}`}>
      <div className={`flex items-start justify-between gap-3 px-5 pt-4 ${flush ? "border-b border-rule pb-3.5" : ""}`}>
        <div className="min-w-0">
          <h2 className="display text-[15.5px] leading-snug font-semibold text-ink">{title}</h2>
          {description && <p className="mt-0.5 text-[12.5px] text-ink-3">{description}</p>}
        </div>
        {action && <div className="shrink-0 pt-0.5 text-[13px]">{action}</div>}
      </div>
      <div className={flush ? "min-h-0 flex-1" : "flex-1 px-5 pt-3 pb-5"}>{children}</div>
    </section>
  );
}
