"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";

const CloseContext = createContext<() => void>(() => {});
export const useCloseDialog = () => useContext(CloseContext);

/**
 * A button that opens a native <dialog>. Used for confirmations and short
 * forms (resign, reset password, transfer) that should not leave the page.
 */
export function DialogButton({
  label,
  title,
  description,
  variant = "secondary",
  size,
  width = 440,
  hideTrigger = false,
  onClose,
  children,
}: {
  label: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  variant?: "primary" | "secondary" | "danger" | "ghost" | "danger-ghost";
  size?: "sm";
  width?: number;
  /** Hide the button but keep the dialog mounted, e.g. when the action it opens no longer applies. */
  hideTrigger?: boolean;
  onClose?: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  // Remount the body on every open so forms start fresh.
  const [openCount, setOpenCount] = useState(0);
  const open = () => {
    setOpenCount((n) => n + 1);
    ref.current?.showModal();
  };
  const close = () => ref.current?.close();
  const cls = { primary: "btn-primary", secondary: "", danger: "btn-danger", ghost: "btn-ghost", "danger-ghost": "btn-danger-ghost" }[variant];

  return (
    <>
      <button type="button" hidden={hideTrigger} className={`btn ${cls} ${size === "sm" ? "btn-sm" : ""}`} onClick={open}>
        {label}
      </button>
      <dialog
        ref={ref}
        className="m-auto rounded-xl border border-rule bg-surface p-0 text-ink shadow-[var(--shadow-float)]"
        style={{ width: `min(${width}px, calc(100vw - 32px))` }}
        onClose={onClose}
        onClick={(e) => {
          if (e.target === ref.current) close();
        }}
      >
        <div className="border-b border-rule px-6 py-4">
          <h2 className="display text-[16.5px] font-semibold">{title}</h2>
          {description && <div className="mt-1 text-[13px] text-ink-2">{description}</div>}
        </div>
        <div key={openCount} className="px-6 py-5">
          <CloseContext.Provider value={close}>{children}</CloseContext.Provider>
        </div>
      </dialog>
    </>
  );
}

/**
 * A dialog opened by the caller rather than by its own button, for one dialog
 * shared by many triggers (e.g. every row of a table). The body remounts each
 * time it opens, so forms start fresh.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  width = 440,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: React.ReactNode;
  width?: number;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [openCount, setOpenCount] = useState(0);
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setOpenCount((n) => n + 1);
  }
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);
  const close = () => ref.current?.close();

  return (
    <dialog
      ref={ref}
      className="m-auto rounded-xl border border-rule bg-surface p-0 text-ink shadow-[var(--shadow-float)]"
      style={{ width: `min(${width}px, calc(100vw - 32px))` }}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) close();
      }}
    >
      <div className="border-b border-rule px-6 py-4">
        <h2 className="display text-[16.5px] font-semibold">{title}</h2>
        {description && <div className="mt-1 text-[13px] text-ink-2">{description}</div>}
      </div>
      <div key={openCount} className="px-6 py-5">
        <CloseContext.Provider value={close}>{open && children}</CloseContext.Provider>
      </div>
    </dialog>
  );
}

export function CancelButton({ label = "Cancel" }: { label?: string }) {
  const close = useCloseDialog();
  return (
    <button type="button" className="btn" onClick={close}>
      {label}
    </button>
  );
}
