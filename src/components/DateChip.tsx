const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** A small calendar leaf: month over day, for lists of dated items. */
export function DateChip({ date }: { date: Date }) {
  return (
    <span aria-hidden className="flex w-11 shrink-0 flex-col items-center rounded-lg border border-rule bg-surface py-1 leading-none">
      <span className="text-[10px] font-semibold tracking-wide text-accent uppercase">{MONTHS[date.getUTCMonth()]}</span>
      <span className="num mt-0.5 text-[15px] font-semibold text-ink">{date.getUTCDate()}</span>
    </span>
  );
}
