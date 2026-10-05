"use client";

import { useRouter } from "next/navigation";
import { withBasePath } from "@/lib/base-path";

/**
 * A table row that opens `href` when clicked anywhere on it. Keep a real link
 * to the same place in one of its cells (usually the title): that's what
 * keyboard and screen-reader users follow. Clicks on links, buttons, tick
 * boxes and labels inside the row, and clicks that end a text selection, are
 * left alone. Without an `href` it is a plain row.
 */
export function ClickableRow({ href, className = "", children }: { href?: string | null; className?: string; children: React.ReactNode }) {
  const router = useRouter();
  if (!href) return <tr className={className || undefined}>{children}</tr>;
  return (
    <tr
      className={`cursor-pointer ${className}`}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("a, button, input, label, select, textarea")) return;
        if (window.getSelection()?.toString()) return;
        // Ctrl/Cmd-click opens it in a new tab, as a link would.
        if (e.ctrlKey || e.metaKey) window.open(withBasePath(href), "_blank");
        else router.push(href);
      }}
    >
      {children}
    </tr>
  );
}
