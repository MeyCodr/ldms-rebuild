import { describe, expect, it } from "vitest";
import { can, ojtStaffScope, type SessionUser } from "@/server/permissions";
import {
  checkOjtImportRow,
  headingKey,
  importDate,
  importTime,
  ojtAttendanceAfterEdit,
  ojtChangeBlock,
  ojtEntryAttendance,
  ojtGroupKey,
  ojtStaffBlock,
  SHORT_OJT_HOURS,
  type OjtImportColumn,
  type OjtPerson,
  type OjtStaff,
} from "@/server/rules/ojt";

const user = (roles: SessionUser["roles"]): SessionUser => ({
  id: 1,
  staffNo: "10003",
  name: "Clerk",
  departmentId: 5,
  departmentName: "Stamping",
  divisionId: 1,
  roles,
  hodOfDepartmentIds: [],
  headOfDivisionIds: [],
  designation: "NON_EXECUTIVE",
  mustChangePassword: false,
});
const admin = user(["LD_ADMIN"]);
const clerk = user(["CLERK"]);
const mainClerk = user(["MAIN_CLERK"]);
const plain = user([]);

const staff = (designation: OjtStaff["designation"], extra: Partial<OjtStaff> = {}): OjtStaff => ({
  name: "Aung Ko Ko",
  staffNo: "C2101",
  status: "ACTIVE",
  designation,
  roles: [],
  hodOf: [],
  headOf: [],
  ...extra,
});

describe("who records OJT for whom", () => {
  it("is L&D admin, main clerks and clerks; plain staff can't", () => {
    expect(can(admin, "ojt.manage")).toBe(true);
    expect(can(mainClerk, "ojt.manage")).toBe(true);
    expect(can(clerk, "ojt.manage")).toBe(true);
    expect(can(plain, "ojt.manage")).toBe(false);
    expect(ojtStaffScope(plain)).toBeNull();
  });

  it("lets clerks see contract staff only, admin everyone", () => {
    expect(ojtStaffScope(clerk)).toEqual({ designation: "CONTRACT" });
    expect(ojtStaffScope(mainClerk)).toEqual({ designation: "CONTRACT" });
    expect(ojtStaffScope(admin)).toEqual({});
  });

  it("lets a clerk record OJT for contract staff", () => {
    expect(ojtStaffBlock(clerk, staff("CONTRACT"))).toBeNull();
  });

  it("refuses a clerk for anyone else, saying why", () => {
    expect(ojtStaffBlock(clerk, staff("EXECUTIVE"))).toBe("Aung Ko Ko (C2101) is executive staff: clerks record OJT for contract staff only");
    expect(ojtStaffBlock(clerk, staff("NON_EXECUTIVE"))).toMatch(/non-executive staff: clerks record OJT for contract staff only/);
  });

  it("refuses a clerk for contract staff who hold extra access", () => {
    expect(ojtStaffBlock(clerk, staff("CONTRACT", { roles: [{ role: "CLERK" }] }))).toMatch(/extra access, so only an L&D admin/);
    expect(ojtStaffBlock(clerk, staff("CONTRACT", { hodOf: [{}] }))).toMatch(/extra access/);
  });

  it("lets admin record OJT for anyone still employed", () => {
    expect(ojtStaffBlock(admin, staff("MANAGER"))).toBeNull();
    expect(ojtStaffBlock(admin, staff("CONTRACT", { roles: [{ role: "CLERK" }] }))).toBeNull();
  });

  it("refuses resigned staff for everyone", () => {
    expect(ojtStaffBlock(admin, staff("CONTRACT", { status: "RESIGNED" }))).toBe("Aung Ko Ko (C2101) has resigned");
    expect(ojtStaffBlock(clerk, staff("CONTRACT", { status: "RESIGNED" }))).toBe("Aung Ko Ko (C2101) has resigned");
  });
});

describe("ojtEntryAttendance", () => {
  it("completes an OJT of 4 hours or less straight away", () => {
    expect(SHORT_OJT_HOURS).toBe(4);
    expect(ojtEntryAttendance(4, false)).toBe("COMPLETED");
    expect(ojtEntryAttendance(2.5, false)).toBe("COMPLETED");
  });
  it("leaves a longer OJT waiting for the person's answers", () => {
    expect(ojtEntryAttendance(4.25, false)).toBe("PENDING");
    expect(ojtEntryAttendance(9, false)).toBe("PENDING");
  });
  it("completes it when the answers came with it", () => {
    expect(ojtEntryAttendance(9, true)).toBe("COMPLETED");
  });
});

describe("ojtChangeBlock", () => {
  const person = (source: OjtPerson["source"], designation: OjtPerson["designation"] = "CONTRACT"): OjtPerson => ({
    source,
    designation,
    name: "Lim Wei Jie",
    staffNo: "C2042",
  });
  it("lets clerks change OJT a clerk recorded or imported, for contract staff", () => {
    expect(ojtChangeBlock(clerk, [person("CLERK"), person("IMPORT")])).toBeNull();
    expect(ojtChangeBlock(mainClerk, [person("IMPORT")])).toBeNull();
  });
  it("leaves L&D's OJT, and OJT with other staff on it, to L&D", () => {
    expect(ojtChangeBlock(clerk, [person("ADMIN")])).toMatch(/L&D unit recorded/);
    expect(ojtChangeBlock(clerk, [person("CLERK"), person("CLERK", "EXECUTIVE")])).toMatch(/aren't contract staff/);
    expect(ojtChangeBlock(admin, [person("ADMIN"), person("CLERK", "EXECUTIVE")])).toBeNull();
  });
  it("leaves OJT someone recorded themselves to them, whoever asks", () => {
    expect(ojtChangeBlock(clerk, [person("SELF")])).toBe("Lim Wei Jie (C2042) recorded this OJT themselves, so only they can change it, on My training.");
    expect(ojtChangeBlock(admin, [person("SELF")])).toMatch(/only they can change it/);
  });
});

describe("ojtAttendanceAfterEdit", () => {
  const waiting = { attendance: "PENDING" as const, hasAnswers: false };
  const short = { attendance: "COMPLETED" as const, hasAnswers: false };
  it("follows the new hours where the hours decided it", () => {
    expect(ojtAttendanceAfterEdit(waiting, 9, 3)).toBe("COMPLETED");
    expect(ojtAttendanceAfterEdit(short, 3, 9)).toBe("PENDING");
    expect(ojtAttendanceAfterEdit(waiting, 9, 8)).toBe("PENDING");
  });
  it("keeps answers given and attendance set by hand", () => {
    expect(ojtAttendanceAfterEdit({ attendance: "COMPLETED", hasAnswers: true }, 3, 9)).toBe("COMPLETED");
    expect(ojtAttendanceAfterEdit({ attendance: "ABSENT", hasAnswers: false }, 9, 3)).toBe("ABSENT");
    // Completed by hand on a long OJT: not the hours' doing, so it stays.
    expect(ojtAttendanceAfterEdit({ attendance: "COMPLETED", hasAnswers: false }, 9, 8)).toBe("COMPLETED");
  });
});

describe("reading the template", () => {
  it("matches headings with or without their hints", () => {
    expect(headingKey("Start Date (YYYY-MM-DD)")).toBe("start date");
    expect(headingKey("  Skill Before Training 1-5 (optional) ")).toBe("skill before training 1-5");
    expect(headingKey("Participant  Staff No")).toBe("participant staff no");
  });

  it("reads dates as YYYY-MM-DD or day first", () => {
    expect(importDate("2026-01-05")).toBe("2026-01-05");
    expect(importDate("5/1/2026")).toBe("2026-01-05");
    expect(importDate("05-01-2026")).toBe("2026-01-05");
    expect(importDate("2026-02-30")).toBeNull();
    expect(importDate("31/13/2026")).toBeNull();
    expect(importDate("Jan 5")).toBeNull();
  });

  it("reads 24-hour times", () => {
    expect(importTime("08:00")).toBe("08:00");
    expect(importTime("8:00")).toBe("08:00");
    expect(importTime("17:30:00")).toBe("17:30");
    expect(importTime("24:00")).toBeNull();
    expect(importTime("8am")).toBeNull();
  });
});

const today = new Date("2026-10-05T00:00:00Z");
const good: Record<OjtImportColumn, string> = {
  Title: "Coil changeover",
  Venue: "Press Line A",
  "Start Date": "2026-09-01",
  "End Date": "2026-09-01",
  "Start Time": "08:00",
  "End Time": "13:00",
  "Trainer Type": "INTERNAL",
  "Trainer Name": "Ahmad bin Ali",
  "Participant Staff No": "c2101",
  "What Did You Learn": "",
  "Skill Before Training 1-5": "",
  "Skill After Training 1-5": "",
};
const row = (changes: Partial<Record<OjtImportColumn, string>>) => checkOjtImportRow({ ...good, ...changes }, today);

describe("checkOjtImportRow", () => {
  it("accepts a complete row, without answers", () => {
    const { row: r, errors } = row({});
    expect(errors).toEqual([]);
    expect(r).toMatchObject({ title: "Coil changeover", trainer: "INTERNAL", staffNo: "C2101", answers: null, hours: 5 });
  });

  it("keeps the three answers when all are given", () => {
    const { row: r, errors } = row({ "What Did You Learn": "Changing coils safely", "Skill Before Training 1-5": "2", "Skill After Training 1-5": "4" });
    expect(errors).toEqual([]);
    expect(r?.answers).toEqual({ a1: "Changing coils safely", a2: 2, a3: 4 });
  });

  it("rejects answers given only in part", () => {
    expect(row({ "Skill After Training 1-5": "4" }).errors).toEqual([
      "What Did You Learn, Skill Before and Skill After: fill in all three or leave all three blank",
    ]);
  });

  it("rejects a skill score outside 1 to 5", () => {
    const { errors } = row({ "What Did You Learn": "x", "Skill Before Training 1-5": "0", "Skill After Training 1-5": "4.5" });
    expect(errors).toEqual(['Skill Before "0" must be a whole number from 1 to 5', 'Skill After "4.5" must be a whole number from 1 to 5']);
  });

  it("flags every empty required cell at once", () => {
    const empty = Object.fromEntries(Object.keys(good).map((k) => [k, ""])) as Record<OjtImportColumn, string>;
    const { errors } = checkOjtImportRow(empty, today);
    expect(errors).toEqual([
      "Title is empty",
      "Venue is empty",
      "Start Date is empty",
      "End Date is empty",
      "Start Time is empty",
      "End Time is empty",
      "Trainer Type is empty (INTERNAL or EXTERNAL)",
      "Trainer Name is empty",
      "Participant Staff No is empty",
    ]);
  });

  it("checks dates, times and the trainer type", () => {
    expect(row({ "Start Date": "2026/09/01" }).errors).toEqual(['Start Date "2026/09/01" is not a date (use YYYY-MM-DD)']);
    expect(row({ "End Date": "2026-08-31" }).errors).toEqual(["End Date is before the Start Date"]);
    expect(row({ "End Time": "07:00" }).errors).toEqual(["End Time must be after the Start Time"]);
    expect(row({ "Trainer Type": "internal" }).errors).toEqual([]);
    expect(row({ "Trainer Type": "Vendor" }).errors).toEqual(['Trainer Type "Vendor" must be INTERNAL or EXTERNAL']);
  });

  it("refuses an OJT that hasn't happened yet", () => {
    expect(row({ "Start Date": "2026-10-05", "End Date": "2026-10-05" }).errors).toEqual([]);
    expect(row({ "Start Date": "2026-10-06", "End Date": "2026-10-06" }).errors).toEqual(["End Date is in the future: OJT is recorded once it has happened"]);
  });

  it("works out hours over several days", () => {
    expect(row({ "End Date": "2026-09-03" }).row?.hours).toBe(15);
  });
});

describe("ojtGroupKey", () => {
  const a = row({}).row!;
  it("groups rows that describe the same OJT", () => {
    expect(ojtGroupKey(a)).toBe(ojtGroupKey(row({ "Participant Staff No": "C2102" }).row!));
  });
  it("keeps apart rows that differ in title (including case), date, time or trainer", () => {
    expect(ojtGroupKey(a)).not.toBe(ojtGroupKey(row({ Title: "COIL CHANGEOVER" }).row!));
    expect(ojtGroupKey(a)).not.toBe(ojtGroupKey(row({ "Start Date": "2026-08-31" }).row!));
    expect(ojtGroupKey(a)).not.toBe(ojtGroupKey(row({ "End Time": "12:00" }).row!));
    expect(ojtGroupKey(a)).not.toBe(ojtGroupKey(row({ "Trainer Name": "Someone else" }).row!));
  });
});
