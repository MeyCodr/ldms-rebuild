// A thin progress bar: teal fill on a sunken track. The label says what is
// measured, for screen readers; the numbers are shown beside it by the caller.

export function Progress({
  value,
  max,
  label,
  size = "md",
  tone = "accent",
  className = "",
}: {
  value: number;
  max: number;
  label: string;
  size?: "sm" | "md";
  /** accent for progress, ok when the bar means "done". */
  tone?: "accent" | "ok" | "night";
  className?: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  const fill = tone === "ok" ? "bg-ok" : tone === "night" ? "bg-accent-bright" : "bg-accent";
  const track = tone === "night" ? "bg-white/15" : "bg-sunken";
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      className={`overflow-hidden rounded-full ${track} ${size === "sm" ? "h-1.5" : "h-2"} ${className}`}
    >
      <div className={`h-full rounded-full ${fill}`} style={{ width: `${pct}%` }} />
    </div>
  );
}
