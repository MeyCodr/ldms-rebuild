import { DateField } from "./DateField";

/**
 * Start and end date filters for a list (`from` and `to`, YYYY-MM-DD), kept
 * side by side so they always wrap onto a new line together. The list keeps
 * rows that start on or after the start date and end on or before the end date.
 */
export function DateRangeFilter({ from, to }: { from?: string; to?: string }) {
  return (
    <div className="flex w-full gap-2 sm:w-auto">
      <div className="min-w-0 flex-1 sm:w-36 sm:flex-none">
        <label htmlFor="from" className="label">
          Start date
        </label>
        <DateField id="from" name="from" defaultValue={from ?? ""} />
      </div>
      <div className="min-w-0 flex-1 sm:w-36 sm:flex-none">
        <label htmlFor="to" className="label">
          End date
        </label>
        <DateField id="to" name="to" defaultValue={to ?? ""} />
      </div>
    </div>
  );
}
