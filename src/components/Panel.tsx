// A white surface for a self-contained block on the overview. List and record
// pages don't use panels; their content sits directly on the page.

export function Panel({
  title,
  action,
  children,
  className = "",
  flush = false,
}: {
  title: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** No inner padding, for lists that run edge to edge. */
  flush?: boolean;
}) {
  return (
    <section className={`rounded-lg border border-rule bg-surface ${className}`}>
      <div className="flex items-center justify-between gap-3 border-b border-rule px-5 py-3">
        <h2 className="display text-[15px] font-semibold text-ink">{title}</h2>
        {action && <div className="text-[13px]">{action}</div>}
      </div>
      <div className={flush ? "" : "px-5 py-4"}>{children}</div>
    </section>
  );
}
