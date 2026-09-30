"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { formatDateInput, parseDateInput } from "@/lib/datetime-input";
import { nowInMalaysia } from "@/lib/format";
import { usePopover } from "./usePopover";

type Props = {
  /** Submitted with the form as YYYY-MM-DD through a hidden input. */
  name: string;
  id?: string;
  /** Controlled value (YYYY-MM-DD, or "" for none). Use with onChange. */
  value?: string;
  defaultValue?: string;
  /** Called with YYYY-MM-DD, or "" while the field is empty or not a date. */
  onChange?: (value: string) => void;
  /** Earliest and latest dates that can be picked (YYYY-MM-DD). */
  min?: string;
  max?: string;
  disabled?: boolean;
  className?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
};

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

const DAY = 86_400_000;
const toIso = (d: Date) => d.toISOString().slice(0, 10);
const fromIso = (iso: string) => new Date(`${iso}T00:00:00Z`);
const addDays = (iso: string, n: number) => toIso(new Date(fromIso(iso).getTime() + n * DAY));
function addMonths(iso: string, n: number) {
  const d = fromIso(iso);
  const day = d.getUTCDate();
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, last));
  return toIso(target);
}
const today = () => toIso(nowInMalaysia());

/**
 * LDMS date field. Type a date (3/4/2026, 03-04-2026, 3 Apr 2026: day first)
 * or pick one from the calendar. Shown as DD/MM/YYYY; submitted as YYYY-MM-DD.
 * Calendar keys: arrows move a day or a week, Page Up/Down a month (with Shift
 * a year), Home/End the start or end of the week, Enter picks, Esc closes.
 */
export function DateField({ name, id, value, defaultValue = "", onChange, min, max, disabled, className = "", ...aria }: Props) {
  const autoId = useId();
  const inputId = id ?? `${autoId}-input`;
  const panelId = `${autoId}-calendar`;
  const controlled = value !== undefined;
  const [inner, setInner] = useState(defaultValue);
  const current = controlled ? value : inner;

  const [text, setText] = useState(formatDateInput(current));
  // The value the text was last shown for. When the parent changes the value
  // (e.g. fills an end date in), the text follows; while the user types, it doesn't.
  const [shownFor, setShownFor] = useState(current);
  if (current !== shownFor) {
    setShownFor(current);
    setText(formatDateInput(current));
  }

  const parsed = parseDateInput(text);
  // Unreadable text is submitted as typed, so the server can say what's wrong.
  const submitted = text.trim() === "" ? "" : (parsed ?? text.trim());

  const emit = (iso: string) => {
    setShownFor(iso);
    if (!controlled) setInner(iso);
    if (iso !== current) onChange?.(iso);
  };

  const [open, setOpen] = useState(false);
  const [focusDay, setFocusDay] = useState(today());
  const input = useRef<HTMLInputElement>(null);
  const close = useCallback(() => setOpen(false), []);
  const { anchor, panel, style } = usePopover({ open, onClose: close, width: 292, minHeight: 330 });

  const outOfRange = (iso: string) => (!!min && iso < min) || (!!max && iso > max);

  function openCalendar() {
    if (disabled) return;
    setFocusDay(parsed || current || today());
    setOpen(true);
  }

  function pick(iso: string) {
    if (outOfRange(iso)) return;
    setText(formatDateInput(iso));
    emit(iso);
    setOpen(false);
    input.current?.focus();
  }

  // Move keyboard focus to the highlighted day whenever it changes (once the
  // calendar has a position and is on screen).
  const shown = open && !!style;
  useEffect(() => {
    if (shown) panel.current?.querySelector<HTMLButtonElement>(`[data-date="${focusDay}"]`)?.focus();
  }, [shown, focusDay, panel]);

  function onGridKey(e: React.KeyboardEvent) {
    const moves: Record<string, () => string> = {
      ArrowLeft: () => addDays(focusDay, -1),
      ArrowRight: () => addDays(focusDay, 1),
      ArrowUp: () => addDays(focusDay, -7),
      ArrowDown: () => addDays(focusDay, 7),
      PageUp: () => addMonths(focusDay, e.shiftKey ? -12 : -1),
      PageDown: () => addMonths(focusDay, e.shiftKey ? 12 : 1),
      Home: () => addDays(focusDay, -((fromIso(focusDay).getUTCDay() + 6) % 7)),
      End: () => addDays(focusDay, 6 - ((fromIso(focusDay).getUTCDay() + 6) % 7)),
    };
    if (moves[e.key]) {
      e.preventDefault();
      setFocusDay(moves[e.key]());
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation(); // don't also close a surrounding dialog
      setOpen(false);
      input.current?.focus();
    }
  }

  // Six weeks starting on the Monday on or before the 1st of the month.
  const first = fromIso(`${focusDay.slice(0, 7)}-01`);
  const gridStart = addDays(toIso(first), -((first.getUTCDay() + 6) % 7));
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const monthLabel = `${MONTH_NAMES[first.getUTCMonth()]} ${first.getUTCFullYear()}`;
  const todayIso = today();

  return (
    <div ref={anchor} className={`relative ${className}`}>
      <input type="hidden" name={name} value={submitted} />
      <input
        ref={input}
        id={inputId}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="DD/MM/YYYY"
        value={text}
        disabled={disabled}
        aria-invalid={aria["aria-invalid"] || (text.trim() !== "" && !parsed) || undefined}
        aria-describedby={aria["aria-describedby"]}
        onChange={(e) => {
          setText(e.target.value);
          emit(parseDateInput(e.target.value) ?? "");
        }}
        onBlur={() => {
          if (parsed) setText(formatDateInput(parsed));
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && (e.altKey || !text)) {
            e.preventDefault();
            openCalendar();
          }
        }}
        className="input num pr-9"
      />
      <button
        type="button"
        tabIndex={-1}
        disabled={disabled}
        aria-label="Choose date"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => (open ? setOpen(false) : openCalendar())}
        className="absolute top-1/2 right-1 flex size-7 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-ink-3 hover:bg-sunken hover:text-ink disabled:cursor-not-allowed"
      >
        <CalendarDays size={15} aria-hidden />
      </button>

      {open && style && (
        <div
          ref={panel}
          id={panelId}
          role="dialog"
          aria-label="Choose date"
          className="fixed z-[60] overflow-auto rounded-lg border border-rule-strong bg-surface p-3 shadow-[0_10px_28px_rgb(23_50_77/0.14)]"
          style={style}
        >
          <div className="mb-2 flex items-center justify-between">
            <button type="button" aria-label="Previous month" onClick={() => setFocusDay(addMonths(focusDay, -1))} className="btn btn-ghost btn-sm w-7 px-0">
              <ChevronLeft size={15} aria-hidden />
            </button>
            <div aria-live="polite" className="display text-[14px] font-semibold text-ink">
              {monthLabel}
            </div>
            <button type="button" aria-label="Next month" onClick={() => setFocusDay(addMonths(focusDay, 1))} className="btn btn-ghost btn-sm w-7 px-0">
              <ChevronRight size={15} aria-hidden />
            </button>
          </div>
          <div role="grid" aria-label={monthLabel} onKeyDown={onGridKey}>
            <div role="row" className="grid grid-cols-7">
              {WEEKDAYS.map((d) => (
                <div key={d} role="columnheader" className="py-1 text-center text-2xs font-semibold text-ink-3">
                  {d}
                </div>
              ))}
            </div>
            {[0, 1, 2, 3, 4, 5].map((week) => (
              <div key={week} role="row" className="grid grid-cols-7">
                {days.slice(week * 7, week * 7 + 7).map((iso) => {
                  const d = fromIso(iso);
                  const inMonth = d.getUTCMonth() === first.getUTCMonth();
                  const selected = iso === (parsed ?? current);
                  const blocked = outOfRange(iso);
                  return (
                    <div key={iso} role="gridcell" aria-selected={selected}>
                      <button
                        type="button"
                        data-date={iso}
                        tabIndex={iso === focusDay ? 0 : -1}
                        disabled={blocked}
                        aria-label={`${d.getUTCDate()} ${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCFullYear()}`}
                        aria-current={iso === todayIso ? "date" : undefined}
                        onClick={() => pick(iso)}
                        className={`num m-0.5 flex h-8 w-[calc(100%-4px)] cursor-pointer items-center justify-center rounded-md text-[13px] focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-35 ${
                          selected ? "bg-primary font-semibold text-white" : inMonth ? "text-ink hover:bg-sunken" : "text-ink-3 hover:bg-sunken"
                        } ${iso === todayIso && !selected ? "ring-1 ring-accent ring-inset" : ""}`}
                      >
                        {d.getUTCDate()}
                      </button>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          <div className="mt-2 flex items-center justify-between border-t border-rule pt-2">
            <button type="button" className="btn btn-ghost btn-sm" disabled={outOfRange(todayIso)} onClick={() => pick(todayIso)}>
              Today
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setText("");
                emit("");
                setOpen(false);
                input.current?.focus();
              }}
            >
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
