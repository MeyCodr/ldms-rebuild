import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { MODULE_ICON } from "@/components/moduleIcons";
import { MODULE_TONE, TONE, type ModuleKey } from "@/lib/tones";

type Props = {
  /** Which module the page belongs to: sets the icon tile and its colour. */
  module: ModuleKey;
  /** Where the page sits: a nav group, or a parent page with a link back. */
  context?: string | { href: string; label: string };
  title: React.ReactNode;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  /** Replaces the module icon, e.g. with a person's avatar on their record. */
  leading?: React.ReactNode;
};

export function PageHeader({ module, context, title, meta, actions, leading }: Props) {
  const Icon = MODULE_ICON[module];
  const tone = TONE[MODULE_TONE[module]];
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4 pb-6">
      <div className="flex min-w-0 items-center gap-4">
        {leading ?? (
          <span aria-hidden className={`flex size-12 shrink-0 items-center justify-center rounded-xl ${tone.tile}`}>
            <Icon size={22} strokeWidth={1.8} />
          </span>
        )}
        <div className="min-w-0">
          {context &&
            (typeof context === "string" ? (
              <div className="eyebrow">{context}</div>
            ) : (
              <Link href={context.href} className="inline-flex items-center gap-1 text-[12.5px] font-medium text-ink-3 hover:text-accent">
                <ArrowLeft size={13} aria-hidden /> {context.label}
              </Link>
            ))}
          <h1 className="display mt-0.5 text-[28px] leading-[1.15] font-semibold text-ink">{title}</h1>
          {meta && <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ink-2">{meta}</div>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
