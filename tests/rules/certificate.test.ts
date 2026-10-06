import { describe, expect, it } from "vitest";
import type { SessionUser } from "@/server/permissions";
import {
  CERTIFICATE_MAX_BYTES,
  certificateDownloadAllowed,
  certificateDownloadName,
  certificateFileBlock,
  certificateKind,
  certificateManageBlock,
  certificateUploadBlock,
  type CertificatePerson,
  type CertificateTraining,
} from "@/server/rules/certificate";

const user = (id: number, roles: SessionUser["roles"] = []): SessionUser => ({
  id,
  staffNo: String(id),
  name: `Staff ${id}`,
  departmentId: 5,
  departmentName: "Stamping",
  divisionId: 1,
  roles,
  hodOfDepartmentIds: [],
  headOfDivisionIds: [],
  mustChangePassword: false,
});
const admin = user(1, ["LD_ADMIN"]);
const clerk = user(2, ["CLERK"]);
const staff = user(3);

const person = (staffId: number, over: Partial<CertificatePerson> = {}): CertificatePerson => ({
  staffId,
  name: `Staff ${staffId}`,
  staffNo: String(staffId),
  designation: "CONTRACT",
  source: "CLERK",
  attendance: "COMPLETED",
  ...over,
});
const training = (over: Partial<CertificateTraining> = {}): CertificateTraining => ({
  type: "PUBLIC_INHOUSE",
  status: "SCHEDULED",
  startDate: new Date("2026-09-01T00:00:00Z"),
  participants: [person(3, { designation: "EXECUTIVE", source: "ADMIN" })],
  ...over,
});
const today = new Date("2026-10-05T00:00:00Z");
const bytes = (...b: number[]) => new Uint8Array([...b, 0, 0, 0, 0]);

describe("certificateKind", () => {
  it("knows PDF, PNG and JPG by their first bytes", () => {
    expect(certificateKind(new TextEncoder().encode("%PDF-1.7\n"))).toBe("pdf");
    expect(certificateKind(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe("png");
    expect(certificateKind(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("jpg");
  });
  it("refuses anything else, whatever it is called", () => {
    expect(certificateKind(new TextEncoder().encode("PK\u0003\u0004 a .docx"))).toBeNull();
    expect(certificateKind(new TextEncoder().encode("hello"))).toBeNull();
    expect(certificateKind(new Uint8Array())).toBeNull();
  });
});

describe("certificateFileBlock", () => {
  it("accepts a PDF, JPG or PNG up to 5 MB", () => {
    expect(certificateFileBlock({ size: CERTIFICATE_MAX_BYTES, kind: "pdf" })).toBeNull();
  });
  it("says what's wrong otherwise", () => {
    expect(certificateFileBlock({ size: 0, kind: "pdf" })).toMatch(/empty/);
    expect(certificateFileBlock({ size: CERTIFICATE_MAX_BYTES + 1, kind: "pdf" })).toMatch(/larger than 5 MB/);
    expect(certificateFileBlock({ size: 100, kind: null })).toMatch(/Only PDF, JPG or PNG/);
  });
});

describe("certificateDownloadName", () => {
  it("keeps the uploader's name, ending in the real type", () => {
    expect(certificateDownloadName("Forklift cert.pdf", "pdf")).toBe("Forklift cert.pdf");
    expect(certificateDownloadName("scan.JPEG", "jpg")).toBe("scan.JPEG");
    expect(certificateDownloadName("scan", "png")).toBe("scan.png");
    expect(certificateDownloadName("renamed.pdf", "png")).toBe("renamed.pdf.png");
  });
  it("drops folders and characters that don't belong in a file name", () => {
    expect(certificateDownloadName("C:\\Users\\me\\cert<1>.pdf", "pdf")).toBe("cert1.pdf");
    expect(certificateDownloadName('../../"x".pdf', "pdf")).toBe("x.pdf");
    expect(certificateDownloadName("", "pdf")).toBe("certificate.pdf");
  });
});

describe("certificateManageBlock", () => {
  it("lets L&D change any training's certificate", () => {
    expect(certificateManageBlock(admin, training())).toBeNull();
  });
  it("leaves trainings other than OJT to L&D", () => {
    expect(certificateManageBlock(clerk, training())).toMatch(/Only the L&D unit/);
    expect(certificateManageBlock(staff, training())).toMatch(/Only the L&D unit/);
  });
  it("lets a clerk change OJT they may change, and no other", () => {
    expect(certificateManageBlock(clerk, training({ type: "OJT", participants: [person(10), person(11, { source: "IMPORT" })] }))).toBeNull();
    expect(certificateManageBlock(clerk, training({ type: "OJT", participants: [person(10, { source: "ADMIN" })] }))).toMatch(/L&D unit recorded/);
    expect(certificateManageBlock(clerk, training({ type: "OJT", participants: [person(10, { designation: "MANAGER" })] }))).toMatch(/aren't contract staff/);
  });
  it("lets staff change an OJT they recorded for themselves", () => {
    const own = training({ type: "OJT", participants: [person(3, { source: "SELF" })] });
    expect(certificateManageBlock(staff, own)).toBeNull();
    expect(certificateManageBlock(user(4), own)).toMatch(/Only the L&D unit/);
    expect(certificateManageBlock(staff, training({ type: "OJT", participants: [person(3, { source: "CLERK" })] }))).toMatch(/Only the L&D unit/);
  });
});

describe("certificateUploadBlock", () => {
  it("allows an upload once the training has started", () => {
    expect(certificateUploadBlock(admin, training({ startDate: today }), today)).toBeNull();
  });
  it("refuses a cancelled training or one still to come", () => {
    expect(certificateUploadBlock(admin, training({ status: "CANCELLED" }), today)).toMatch(/cancelled/);
    expect(certificateUploadBlock(admin, training({ startDate: new Date("2026-10-06T00:00:00Z") }), today)).toMatch(/once the training has started/);
  });
  it("gives who-may first", () => {
    expect(certificateUploadBlock(staff, training({ status: "CANCELLED" }), today)).toMatch(/Only the L&D unit/);
  });
});

describe("certificateDownloadAllowed", () => {
  const t = training({ participants: [person(3, { attendance: "COMPLETED" }), person(4, { attendance: "PENDING" }), person(5, { attendance: "ABSENT" })] });
  it("lets L&D and anyone who completed it download", () => {
    expect(certificateDownloadAllowed(admin, t)).toBe(true);
    expect(certificateDownloadAllowed(staff, t)).toBe(true);
  });
  it("refuses people still pending, absent, or not on it", () => {
    expect(certificateDownloadAllowed(user(4), t)).toBe(false);
    expect(certificateDownloadAllowed(user(5), t)).toBe(false);
    expect(certificateDownloadAllowed(user(6), t)).toBe(false);
  });
  it("lets a clerk download OJT of contract staff only", () => {
    expect(certificateDownloadAllowed(clerk, training({ type: "OJT", participants: [person(10)] }))).toBe(true);
    expect(certificateDownloadAllowed(clerk, training({ type: "OJT", participants: [person(10, { designation: "EXECUTIVE" })] }))).toBe(false);
    expect(certificateDownloadAllowed(clerk, t)).toBe(false);
  });
});
