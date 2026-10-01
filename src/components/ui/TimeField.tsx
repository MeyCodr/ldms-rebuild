"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Clock } from "lucide-react";
import { parseTimeInput, TIME_SLOTS } from "@/lib/datetime-input";
import { usePopover } from "./usePopover";

type Props = {
  /** Submitted with the form as HH:MM (24-hour) through a hidden input. */
  name: string;
  id?: string;
  /** Controlled value (HH:MM, or "" for none). Use with onChange. */
  value?: string;
  defaultValue?: string;
  /** Called with HH:MM, or "" while the field is empty or not a time. */
  onChange?: (value: string) => void;
  disabled?: boolean;
  className?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
};

/** The slot to highlight when the list opens: the value itself, or the next one after it. */
function nearestSlot(time: string): number {
  const i = TIME_SLOTS.findIndex((s) => s >= (time || "08:00"));
  return i < 0 ? TIME_SLOTS.length - 1 : i;
}

/**
 * LDMS time field, 24-hour. Type a time (8:30, 0830, 8.30pm) or pick one from
 * the list, which steps every 15 minutes. List keys: ↑↓ move, Page Up/Down an
 * hour, Enter picks, Esc closes.
 */
export function TimeField({ name, id, value, defaultValue = "", onChange, disabled, className = "", ...aria }: Props) {
  const autoId = useId();
  const inputId = id ?? `${autoId}-input`;
  const listId = `${autoId}-list`;
  const controlled = value !== undefined;
  const [inner, setInner] = useState(defaultValue);
  const current = controlled ? value : inner;

  const [text, setText] = useState(current);
  // Follow value changes from the parent, but not the ones the user is typing.
  const [shownFor, setShownFor] = useState(current);
  if (current !== shownFor) {
    setShownFor(current);
    setText(current);
  }

  const parsed = parseTimeInput(text);
  // Unreadable text is submitted as typed, so the server can say what's wrong.
  const submitted = text.trim() === "" ? "" : (parsed ?? text.trim());

  const emit = (time: string) => {
    setShownFor(time);
    if (!controlled) setInner(time);
    if (time !== current) onChange?.(time);
  };

  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const close = useCallback(() => setOpen(false), []);
  const { anchor, panel, style } = usePopover({ open, onClose: close, width: 150, minHeight: 200 });

  function openList() {
    if (disabled) return;
    setActive(nearestSlot(parsed ?? current));
    setOpen(true);
  }

  function pick(time: string) {
    setText(time);
    emit(time);
    setOpen(false);
    input.current?.focus();
  }

  // Keep the highlighted time in view: centred when the list first appears,
  // then just enough to show it. The list appears once it has a position.
  const shown = open && !!style;
  const centred = useRef(false);
  useEffect(() => {
    if (!shown) {
      centred.current = false;
      return;
    }
    panel.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: centred.current ? "nearest" : "center" });
    centred.current = true;
  }, [active, shown, panel]);

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    const step: Record<string, number> = { ArrowDown: 1, ArrowUp: -1, PageDown: 4, PageUp: -4 };
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        openList();
      }
      return;
    }
    if (e.key in step) {
      e.preventDefault();
      setActive((i) => Math.min(TIME_SLOTS.length - 1, Math.max(0, i + step[e.key])));
    } else if (e.key === "Enter") {
      e.preventDefault();
      pick(TIME_SLOTS[active]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation(); // don't also close a surrounding dialog
      setOpen(false);
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  }

  return (
    <div ref={anchor} className={`relative ${className}`}>
      <input type="hidden" name={name} value={submitted} />
      <input
        ref={input}
        id={inputId}
        type="text"
        role="combobox"
        aria-autocomplete="none"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        inputMode="numeric"
        autoComplete="off"
        placeholder="HH:MM"
        value={text}
        disabled={disabled}
        aria-invalid={aria["aria-invalid"] || (text.trim() !== "" && !parsed) || undefined}
        aria-describedby={aria["aria-describedby"]}
        onChange={(e) => {
          setText(e.target.value);
          emit(parseTimeInput(e.target.value) ?? "");
          if (open) setOpen(false); // typing takes over from the list
        }}
        onBlur={() => {
          if (parsed) setText(parsed);
        }}
        onKeyDown={onKey}
        className="input num pr-9"
      />
      <button
        type="button"
        tabIndex={-1}
        disabled={disabled}
        aria-label="Choose time"
        onMouseDown={(e) => e.preventDefault()} // keep focus in the input
        onClick={() => {
          if (open) setOpen(false);
          else {
            openList();
            input.current?.focus();
          }
        }}
        className="absolute top-1/2 right-1 flex size-7 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-ink-3 hover:bg-sunken hover:text-ink disabled:cursor-not-allowed"
      >
        <Clock size={15} aria-hidden />
      </button>

      {open && style && (
        <div
          ref={panel}
          className="fixed z-[60] overflow-y-auto rounded-[10px] border border-rule bg-surface py-1 shadow-[var(--shadow-float)]"
          style={{ ...style, maxHeight: Math.min(260, (style.maxHeight as number) ?? 260) }}
        >
          <ul id={listId} role="listbox" aria-label="Times">
            {TIME_SLOTS.map((slot, i) => {
              const selected = slot === (parsed ?? current);
              return (
                <li
                  key={slot}
                  id={`${listId}-${i}`}
                  data-index={i}
                  role="option"
                  aria-selected={selected}
                  // Only real pointer movement highlights; a list opening under a resting
                  // pointer (e.g. from the keyboard) keeps the current time highlighted.
                  onMouseMove={() => active !== i && setActive(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(slot)}
                  className={`num mx-1 cursor-pointer rounded-md px-3 py-1.5 text-[13.5px] ${i === active ? "bg-sunken" : ""} ${selected ? "font-semibold text-accent" : "text-ink"}`}
                >
                  {slot}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
