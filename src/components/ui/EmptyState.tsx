import type { LucideIcon } from "lucide-react";

/** What a card or list shows when there is nothing in it yet, and why. */
export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
  compact = false,
}: {
  icon: LucideIcon;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={`flex flex-col items-center text-center ${compact ? "gap-1.5 py-6" : "gap-2 py-10"}`}>
      <span aria-hidden className="mb-1 flex size-10 items-center justify-center rounded-full bg-sunken text-ink-3">
        <Icon size={18} strokeWidth={1.9} />
      </span>
      <p className="text-[13.5px] font-medium text-ink">{title}</p>
      {children && <div className="max-w-sm text-[13px] text-ink-3">{children}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
