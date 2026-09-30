import { describe, expect, it } from "vitest";
import { formatDateInput, parseDateInput, parseTimeInput, TIME_SLOTS } from "@/lib/datetime-input";

describe("parseDateInput", () => {
  it.each([
    ["3/4/2026", "2026-04-03"],
    ["03/04/2026", "2026-04-03"],
    ["3-4-2026", "2026-04-03"],
    ["3.4.26", "2026-04-03"],
    ["03042026", "2026-04-03"],
    ["2026-04-03", "2026-04-03"],
    ["3 Apr 2026", "2026-04-03"],
    ["3 april 2026", "2026-04-03"],
    [" 29/02/2028 ", "2028-02-29"],
  ])("%s → %s (day first)", (text, iso) => {
    expect(parseDateInput(text)).toBe(iso);
  });

  it.each(["31/04/2026", "29/02/2026", "13/13/2026", "0/1/2026", "3/4", "next friday", "", "3 Foo 2026"])("rejects %s", (text) => {
    expect(parseDateInput(text)).toBeNull();
  });

  it("formats an ISO date for display", () => {
    expect(formatDateInput("2026-04-03")).toBe("03/04/2026");
    expect(formatDateInput("")).toBe("");
  });
});

describe("parseTimeInput", () => {
  it.each([
    ["8:30", "08:30"],
    ["08.30", "08:30"],
    ["0830", "08:30"],
    ["830", "08:30"],
    ["8", "08:00"],
    ["17:30:00", "17:30"],
    ["8:30pm", "20:30"],
    ["8 PM", "20:00"],
    ["12am", "00:00"],
    ["12pm", "12:00"],
    ["12:15 a", "00:15"],
  ])("%s → %s", (text, time) => {
    expect(parseTimeInput(text)).toBe(time);
  });

  it.each(["24:00", "8:60", "13pm", "0am", "abc", ""])("rejects %s", (text) => {
    expect(parseTimeInput(text)).toBeNull();
  });

  it("offers every 15 minutes of the day", () => {
    expect(TIME_SLOTS).toHaveLength(96);
    expect(TIME_SLOTS.slice(0, 2)).toEqual(["00:00", "00:15"]);
    expect(TIME_SLOTS.at(-1)).toBe("23:45");
  });
});
