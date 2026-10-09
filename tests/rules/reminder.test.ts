import { describe, expect, it } from "vitest";
import { renderEmail } from "@/server/rules/emailTemplates";
import {
  closingDateBlock,
  daysWaiting,
  digestEmail,
  digestKey,
  digestSubject,
  groupReminders,
  inClosingWindow,
  inSkillFillWindow,
  isChased,
  parseClosing,
  parseDay,
  parseReminderSwitches,
  REMINDER_COLUMNS,
  REMINDER_INFO,
  REMINDER_KINDS,
  reminderHref,
  type ReminderItem,
} from "@/server/rules/reminder";

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const TODAY = day("2026-10-08");
const link = (path: string) => `https://ldms.example/phn-ldms${path}`;

describe("which reminders are on", () => {
  it("has every kind on unless it is switched off", () => {
    const all = parseReminderSwitches(undefined);
    expect(Object.keys(all)).toEqual([...REMINDER_KINDS]);
    expect(Object.values(all).every(Boolean)).toBe(true);
    const some = parseReminderSwitches({ FEEDBACK: false, PME_VERIFY: true, SOMETHING_ELSE: false });
    expect(some.FEEDBACK).toBe(false);
    expect(some.PME_VERIFY).toBe(true);
    expect(some.TNA_START).toBe(true);
  });
  it("describes every kind for L&D and for the email", () => {
    for (const k of REMINDER_KINDS) {
      expect(REMINDER_INFO[k].label.length).toBeGreaterThan(5);
      expect(REMINDER_INFO[k].href.startsWith("/")).toBe(true);
    }
  });
});

describe("chase from", () => {
  it("reads a day, and nothing else", () => {
    expect(parseDay("2026-09-01")?.toISOString()).toBe("2026-09-01T00:00:00.000Z");
    for (const v of ["", "2026-02-30", "01/09/2026", 20260901, null]) expect(parseDay(v)).toBeNull();
  });
  it("leaves out what became due before that day, and keeps what has no day of its own", () => {
    const from = day("2026-09-01");
    expect(isChased({ since: day("2026-08-31") }, from)).toBe(false);
    expect(isChased({ since: day("2026-09-01") }, from)).toBe(true);
    expect(isChased({ since: new Date("2026-09-01T15:30:00Z") }, from)).toBe(true);
    expect(isChased({ since: null }, from)).toBe(true);
    expect(isChased({ since: day("2020-01-01") }, null)).toBe(true);
  });
});

describe("skill matrices not yet submitted", () => {
  it("are chased only in the last month before the quarter closes", () => {
    for (const m of ["03", "06", "09", "12"]) expect(inSkillFillWindow(day(`2026-${m}-15`))).toBe(true);
    for (const m of ["01", "02", "04", "05", "07", "08", "10", "11"]) expect(inSkillFillWindow(day(`2026-${m}-15`))).toBe(false);
  });
});

describe("the closing date for TNAs and TNIs", () => {
  it("counts only when it is for the open year", () => {
    expect(parseClosing({ year: 2026, date: "2026-11-30" }, 2026)).toEqual({ year: 2026, date: day("2026-11-30") });
    expect(parseClosing({ year: 2026, date: "2026-11-30" }, 2027)).toBeNull();
    for (const v of [undefined, {}, { year: 2026 }, { year: 2026, date: "soon" }]) expect(parseClosing(v, 2026)).toBeNull();
  });
  it("starts the reminders 14 days before, and they go on after it", () => {
    const closing = { year: 2026, date: day("2026-11-30") };
    expect(inClosingWindow(closing, day("2026-11-15"))).toBe(false);
    expect(inClosingWindow(closing, day("2026-11-16"))).toBe(true);
    expect(inClosingWindow(closing, day("2026-12-20"))).toBe(true);
  });
  it("means no one is chased to start when there is none", () => {
    expect(inClosingWindow(null, TODAY)).toBe(false);
  });
  it("is a day from today to the end of the open year", () => {
    expect(closingDateBlock(day("2026-10-08"), 2026, TODAY)).toBeNull();
    expect(closingDateBlock(day("2026-12-31"), 2026, TODAY)).toBeNull();
    expect(closingDateBlock(null, 2026, TODAY)).toBe("Enter a date.");
    expect(closingDateBlock(day("2026-10-07"), 2026, TODAY)).toBe("The closing date can't be in the past.");
    expect(closingDateBlock(day("2027-01-01"), 2026, TODAY)).toBe("The closing date for 2026's TNAs and TNIs can't be after 2026.");
    // Next year opened early: a date this year or next is fine.
    expect(closingDateBlock(day("2026-12-15"), 2027, TODAY)).toBeNull();
  });
});

/** What a reader sees: the email's text with the markup and the head taken out. */
const textOf = (html: string) =>
  html
    .replace(/<head>[\s\S]*?<\/head>/, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&middot;/g, "·")
    .replace(/\s+/g, " ")
    .trim();

describe("the email", () => {
  const items: ReminderItem[] = [
    { kind: "TNA_APPROVE", text: "Ahmad bin Ali, 2026", cells: ["10233", "Ahmad bin Ali", "2026"], since: day("2026-10-07") },
    { kind: "PME_EVALUATE", text: "Siti <Aminah>, 5S & Kaizen", cells: ["10240", "Siti <Aminah>", "5S & Kaizen"], since: day("2026-09-28") },
    { kind: "PME_EVALUATE", text: "Ahmad bin Ali, Lean", cells: ["10233", "Ahmad bin Ali", "Lean"], since: day("2026-10-08") },
    { kind: "TNI_START", text: "Stamping's TNI for 2026 closes on 30 Nov 2026", cells: ["Stamping", "2026", "30 Nov 2026"], since: null },
  ];

  it("is one per person per day", () => {
    expect(digestKey(231, TODAY)).toBe("digest:231:2026-10-08");
    expect(digestKey(231, day("2026-10-09"))).not.toBe(digestKey(231, TODAY));
  });
  it("counts the things in its subject", () => {
    expect(digestSubject(1)).toBe("LDMS: 1 thing is waiting for you");
    expect(digestSubject(4)).toBe("LDMS: 4 things are waiting for you");
  });
  it("groups by kind in a fixed order, the longest-waiting first", () => {
    const groups = groupReminders(items);
    expect(groups.map((g) => g.kind)).toEqual(["PME_EVALUATE", "TNA_APPROVE", "TNI_START"]);
    expect(groups[0].items.map((i) => i.text)).toEqual(["Siti <Aminah>, 5S & Kaizen", "Ahmad bin Ali, Lean"]);
  });
  it("says how long each has waited", () => {
    expect(daysWaiting(day("2026-09-28"), TODAY)).toBe(10);
    const text = textOf(digestEmail("Nor Azlina", items, TODAY, link).html);
    expect(text).toContain("5S & Kaizen 10 ");
    expect(text).toContain("Ahmad bin Ali 2026 1 ");
    expect(text).toContain("Ahmad bin Ali Lean Today");
  });
  it("lists each kind as a table: a number, who and what in columns, and the days waiting", () => {
    const text = textOf(digestEmail("Nor Azlina", items, TODAY, link).html);
    expect(text).toContain("No. Staff no. Staff name Training Days waiting");
    expect(text).toContain("1 10240 Siti <Aminah> 5S & Kaizen 10 2 10233 Ahmad bin Ali Lean Today");
    expect(text).toContain("No. Staff no. Staff name Year Days waiting 1 10233 Ahmad bin Ali 2026 1");
  });
  it("leaves the days column out of a table whose rows have no day of their own", () => {
    const text = textOf(digestEmail("Nor Azlina", items, TODAY, link).html);
    expect(text).toContain("TNIs not filled in yet (1) No. Department Year Closes on 1 Stamping 2026 30 Nov 2026 Open TNI");
  });
  it("has the same number of cells in every row as it has headings", () => {
    for (const k of REMINDER_KINDS) expect(REMINDER_COLUMNS[k].length).toBeGreaterThan(0);
    const { html } = digestEmail("Nor Azlina", items, TODAY, link);
    for (const table of html.split('border-collapse:collapse;">').slice(1)) {
      const rows = table.split("</table>")[0].split("<tr>").slice(1).filter((r) => !r.includes("colspan"));
      const counts = rows.map((r) => (r.match(/<td/g) ?? []).length);
      expect(new Set(counts).size).toBe(1);
    }
  });
  it("is a whole document in LDMS's layout, named for the person, with each kind's count and a button into LDMS", () => {
    const { subject, html } = digestEmail("Nor Azlina", items, TODAY, link);
    const text = textOf(html);
    expect(subject).toBe("LDMS: 4 things are waiting for you");
    expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(html).toContain("<title>LDMS: 4 things are waiting for you</title>");
    expect(text).toContain("Learning and Development Management System · PHN Industry");
    expect(text).toContain("Dear Nor Azlina ,");
    expect(text).toContain("4 things are waiting for you in LDMS.");
    expect(text).toContain("PMEs to evaluate (2)");
    expect(text).toContain("TNAs to approve (1)");
    expect(html).toContain('href="https://ldms.example/phn-ldms/approvals"');
    expect(html).toContain('href="https://ldms.example/phn-ldms/tni"');
    expect(text).toContain("Open Approvals");
    expect(text).toContain("You will get this email each day until these are done.");
    expect(text).toContain("This is an auto-generated email, no reply is needed.");
  });
  it("carries a line for the inbox's preview, hidden in the email itself", () => {
    const { html } = digestEmail("Nor Azlina", items, TODAY, link);
    expect(html).toContain("PMEs to evaluate (2) · TNAs to approve (1) · TNIs not filled in yet (1)</div>");
  });
  it("escapes what people typed", () => {
    const { html } = digestEmail("A <b>", items, TODAY, link);
    expect(html).toContain("A &lt;b&gt;");
    expect(html).toContain("Siti &lt;Aminah&gt;");
    expect(html).toContain("5S &amp; Kaizen");
    expect(html).not.toContain("<Aminah>");
    expect(html).not.toContain("<b>");
  });
  it("lists ten of a kind and counts the rest", () => {
    const many: ReminderItem[] = Array.from({ length: 13 }, (_, i) => ({ kind: "FEEDBACK", text: `Training ${String(i).padStart(2, "0")}`, cells: [`Training ${String(i).padStart(2, "0")}`, "01 Oct 2026"], since: day("2026-10-01") }));
    const { html } = digestEmail("A", many, TODAY, link);
    const text = textOf(html);
    expect(text).toContain("Trainings waiting for your feedback form (13)");
    expect(text.match(/Training \d\d 01 Oct 2026 7 /g)).toHaveLength(10);
    expect(text).toContain("and 3 more, listed in LDMS");
  });
  it("says nothing of more when they all fit", () => {
    expect(textOf(digestEmail("A", items, TODAY, link).html)).not.toContain(" more");
  });
  it("speaks of one thing in the singular", () => {
    const text = textOf(digestEmail("A", [items[0]], TODAY, link).html);
    expect(text).toContain("1 thing is waiting for you in LDMS.");
    expect(text).toContain("until it is done");
  });
  it("sends a person to My TNA for their own sent-back TNA, and to the TNA screen for a job grade's", () => {
    expect(reminderHref("TNA_RETURNED", [{ kind: "TNA_RETURNED", text: "Your TNA for 2026", cells: ["Your own TNA", "2026"], since: null, own: true }])).toBe("/my-tna");
    expect(reminderHref("TNA_RETURNED", [{ kind: "TNA_RETURNED", text: "Stamping, job grade 4, 2026", cells: ["Stamping, job grade 4", "2026"], since: null }])).toBe("/tna");
  });
});

describe("the test email", () => {
  it("uses the same layout and names who sent it, escaped", () => {
    const html = renderEmail("test", { sentBy: "Nor <Azlina>" }, "LDMS test email", "If you can read this, the server can send email.");
    expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(html).toContain("<title>LDMS test email</title>");
    expect(textOf(html)).toContain("This is a test email from LDMS.");
    expect(html).toContain("It was sent by Nor &lt;Azlina&gt; from the Jobs and email screen.");
    expect(textOf(html)).toContain("Learning & Development, PHN Industry Sdn Bhd");
  });
});
