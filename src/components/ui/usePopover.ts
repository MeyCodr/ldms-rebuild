"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

export type PopoverPosition = { left: number; top?: number; bottom?: number; maxHeight: number };

/**
 * Places a fixed-position panel under an anchor, or above it when there is no
 * room, keeps it on screen, follows scrolling and resizing, and closes it on a
 * click outside. Fixed positioning keeps it clear of scrolling containers and
 * dialogs. Used by the date and time fields.
 */
export function usePopover({ open, onClose, width, minHeight = 240 }: { open: boolean; onClose: () => void; width: number; minHeight?: number }) {
  const anchor = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<PopoverPosition | null>(null);

  const place = useCallback(() => {
    const r = anchor.current?.getBoundingClientRect();
    if (!r) return;
    const below = window.innerHeight - r.bottom - 8;
    const above = r.top - 8;
    const up = below < minHeight && above > below;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - Math.min(width, window.innerWidth - 16) - 8));
    setPos(up ? { left, bottom: window.innerHeight - r.top + 4, maxHeight: above } : { left, top: r.bottom + 4, maxHeight: below });
  }, [width, minHeight]);

  useLayoutEffect(() => {
    if (!open) return;
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!panel.current?.contains(t) && !anchor.current?.contains(t)) onClose();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, onClose]);

  const style: React.CSSProperties | undefined = pos
    ? { left: pos.left, top: pos.top, bottom: pos.bottom, width: `min(${width}px, calc(100vw - 16px))`, maxHeight: pos.maxHeight }
    : undefined;

  return { anchor, panel, style: open ? style : undefined };
}
