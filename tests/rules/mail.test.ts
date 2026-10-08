import { describe, expect, it } from "vitest";
import { can, type SessionUser } from "@/server/permissions";
import {
  dayKey,
  isEmail,
  jobIsStale,
  jobSummaryText,
  mailMode,
  mailModeBlock,
  mailRoute,
  mailTransport,
  parseJobSummary,
  parseSending,
  parseTestMode,
  retentionCutoff,
  sendingBlock,
  testModeBlock,
} from "@/server/rules/mail";

const ON = { enabled: true, address: "ldms-test@phn.com.my" };
const OFF = { enabled: false, address: "ldms-test@phn.com.my" };

describe("test mode", () => {
  it("reads the stored setting", () => {
    expect(parseTestMode({ enabled: true, address: " ldms-test@phn.com.my " })).toEqual(ON);
    expect(parseTestMode({ enabled: false, address: "ldms-test@phn.com.my" })).toEqual(OFF);
  });
  it("counts anything unreadable as on with no address, so nothing reaches staff by accident", () => {
    for (const v of [null, undefined, 2026, "off", [], {}]) expect(parseTestMode(v).enabled).toBe(true);
    expect(parseTestMode(null).address).toBe("");
    expect(parseTestMode({ enabled: "no" }).enabled).toBe(true);
  });
  it("needs a real address to be switched on, and none to be switched off", () => {
    expect(testModeBlock(ON)).toBeNull();
    expect(testModeBlock({ enabled: true, address: "" })).toBe("Enter the address test emails go to.");
    expect(testModeBlock({ enabled: true, address: "not an address" })).toBe("That doesn't look like an email address.");
    expect(testModeBlock({ enabled: false, address: "" })).toBeNull();
  });
});

describe("where an email goes", () => {
  it("goes to the test address in test mode, naming who it was meant for", () => {
    expect(mailRoute("hod@phn.com.my", "PMEs waiting for you", ON)).toEqual({ sentTo: "ldms-test@phn.com.my", subject: "[TEST - intended for hod@phn.com.my] PMEs waiting for you" });
  });
  it("goes to the real recipient, untouched, once test mode is off", () => {
    expect(mailRoute("hod@phn.com.my", "PMEs waiting for you", OFF)).toEqual({ sentTo: "hod@phn.com.my", subject: "PMEs waiting for you" });
  });
  it("can't be sent in test mode without a usable test address", () => {
    expect(mailRoute("hod@phn.com.my", "x", { enabled: true, address: "" })).toBeNull();
    expect(mailRoute("hod@phn.com.my", "x", { enabled: true, address: "nope" })).toBeNull();
  });
  it("keeps the subject within the column", () => {
    expect(mailRoute("hod@phn.com.my", "x".repeat(200), ON)!.subject).toHaveLength(200);
  });
  it("checks an address loosely", () => {
    expect(isEmail("a.b@phn.com.my")).toBe(true);
    for (const bad of ["", "a@b", "a b@phn.com.my", "@phn.com.my", `${"a".repeat(160)}@phn.com.my`]) expect(isEmail(bad)).toBe(false);
  });
});

describe("the Sending switch", () => {
  it("starts off, and counts anything unreadable as off", () => {
    expect(parseSending(true)).toBe(true);
    for (const v of [undefined, null, false, "true", 1, { enabled: true }]) expect(parseSending(v)).toBe(false);
  });
  it("only records while it is off, whatever mail server is set up", () => {
    expect(mailTransport(false, "smtp.office365.com")).toBe("record");
    expect(mailTransport(false, undefined)).toBe("record");
  });
  it("sends through the mail server once on, and fails without one", () => {
    expect(mailTransport(true, "smtp.office365.com")).toBe("smtp");
    expect(mailTransport(true, undefined)).toBe("off");
    expect(mailTransport(true, "")).toBe("off");
  });
  it("can't be switched on without a mail server and a sender", () => {
    expect(sendingBlock("smtp.office365.com", "ldms@phn.com.my")).toBeNull();
    expect(sendingBlock(undefined, "ldms@phn.com.my")).toMatch(/No mail server is set up/);
    expect(sendingBlock("smtp.office365.com", undefined)).toMatch(/No sender address is set up/);
  });
});

describe("the email mode L&D choose", () => {
  it("is Off while nothing is sent, whatever test mode says", () => {
    expect(mailMode(false, ON)).toBe("OFF");
    expect(mailMode(false, OFF)).toBe("OFF");
  });
  it("is Test when sending to the test address, and Live when sending to staff", () => {
    expect(mailMode(true, ON)).toBe("TEST");
    expect(mailMode(true, OFF)).toBe("LIVE");
  });
  it("can always be put to Off", () => {
    expect(mailModeBlock("OFF", "", "No mail server is set up.")).toBeNull();
  });
  it("needs the mail server set up for Test and Live", () => {
    expect(mailModeBlock("TEST", "ldms-test@phn.com.my", "No mail server is set up.")).toEqual({ message: "No mail server is set up." });
    expect(mailModeBlock("LIVE", "", "No mail server is set up.")).toEqual({ message: "No mail server is set up." });
  });
  it("needs a test address for Test, and none for Live", () => {
    expect(mailModeBlock("TEST", "ldms-test@phn.com.my", null)).toBeNull();
    expect(mailModeBlock("TEST", "", null)).toEqual({ message: "Enter the address test emails go to.", field: "address" });
    expect(mailModeBlock("TEST", "nope", null)).toEqual({ message: "That doesn't look like an email address.", field: "address" });
    expect(mailModeBlock("LIVE", "", null)).toBeNull();
  });
});

describe("the daily job", () => {
  const started = new Date("2026-10-08T00:00:00Z");
  it("takes a run to have died after 30 minutes", () => {
    expect(jobIsStale(started, new Date("2026-10-08T00:30:00Z"))).toBe(false);
    expect(jobIsStale(started, new Date("2026-10-08T00:30:01Z"))).toBe(true);
  });
  it("keeps records for 90 days", () => {
    expect(retentionCutoff(new Date("2026-10-08T00:00:00Z")).toISOString()).toBe("2026-07-10T00:00:00.000Z");
  });
  it("names the day an email belongs to", () => {
    expect(dayKey(new Date("2026-10-08T23:59:00Z"))).toBe("2026-10-08");
  });
  it("says what a run did in one line", () => {
    const none = { emailsSent: 0, emailsRecorded: 0, emailsFailed: 0, removedEmails: 0, removedNotifications: 0, removedRuns: 0 };
    expect(jobSummaryText(none)).toBe("0 emails sent");
    expect(jobSummaryText({ ...none, emailsSent: 1 })).toBe("1 email sent");
    expect(jobSummaryText({ ...none, emailsSent: 12, emailsFailed: 2, removedEmails: 3, removedRuns: 1 })).toBe("12 emails sent, 2 failed, 4 old records removed");
    // Sending switched off: it says so, and doesn't claim any was sent.
    expect(jobSummaryText({ ...none, emailsRecorded: 5 })).toBe("5 emails recorded only (sending is off)");
  });
  it("reads a stored summary, and nothing from a run that has none", () => {
    expect(parseJobSummary({ emailsSent: 3, emailsFailed: 1 })).toEqual({ emailsSent: 3, emailsRecorded: 0, emailsFailed: 1, removedEmails: 0, removedNotifications: 0, removedRuns: 0 });
    expect(parseJobSummary(null)).toBeNull();
  });
});

describe("who manages email and the daily job", () => {
  const base: SessionUser = { id: 1, staffNo: "1", name: "A", departmentId: 1, departmentName: "D", divisionId: 1, designation: "EXECUTIVE", roles: [], hodOfDepartmentIds: [], headOfDivisionIds: [], mustChangePassword: false };
  it("is L&D only", () => {
    expect(can({ ...base, roles: ["LD_ADMIN"] }, "jobs.manage")).toBe(true);
    expect(can({ ...base, roles: ["MAIN_CLERK"] }, "jobs.manage")).toBe(false);
    expect(can({ ...base, hodOfDepartmentIds: [1], headOfDivisionIds: [1] }, "jobs.manage")).toBe(false);
    expect(can(base, "jobs.manage")).toBe(false);
  });
});
