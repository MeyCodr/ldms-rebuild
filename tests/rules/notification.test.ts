import { describe, expect, it } from "vitest";
import { notificationAsks, notificationsToWrite, pmeNotification, safeNotificationHref, skillNotification, tnaNotification } from "@/server/rules/notification";

const PME = { id: 7, participantId: 41, staffId: 233, staffName: "Ahmad bin Ali", training: "5S and Kaizen" };

describe("PME notifications", () => {
  it("tells the staff member their HOD has evaluated them, and leads to their training", () => {
    expect(pmeNotification("pme.evaluated", PME, null)).toEqual({
      staffId: 233,
      kind: "pme.evaluated",
      title: "Your HOD has evaluated your PME for 5S and Kaizen. Open it to acknowledge.",
      href: "/my-training/41",
      entity: "Pme",
      entityId: 7,
    });
  });
  it("tells the staff member when L&D have verified it", () => {
    const n = pmeNotification("pme.verified", PME, null)!;
    expect(n.staffId).toBe(233);
    expect(n.title).toBe("L&D have verified your PME for 5S and Kaizen.");
  });
  it("tells the HOD when L&D send it back, and leads to the PME record", () => {
    const n = pmeNotification("pme.returned", PME, 231)!;
    expect(n).toMatchObject({ staffId: 231, href: "/pme/7", title: "L&D sent Ahmad bin Ali's PME for 5S and Kaizen back to you to evaluate again." });
  });
  it("tells no one when the department has no HOD to send it back to", () => {
    expect(pmeNotification("pme.returned", PME, null)).toBeNull();
  });
});

describe("skill matrix notifications", () => {
  const M = { id: 12, staffName: "Siti binti Omar", quarter: "Q3 2026", evaluatorId: 240 };
  it("tells whoever filled it in that the HOD sent it back", () => {
    expect(skillNotification("skill.returned", M, "Nor Azlina")).toMatchObject({ staffId: 240, href: "/skill-matrix/12", title: "Nor Azlina sent Siti binti Omar's skill matrix for Q3 2026 back to you." });
  });
  it("tells them when it is approved", () => {
    expect(skillNotification("skill.approved", M, "Nor Azlina")!.title).toBe("Nor Azlina approved Siti binti Omar's skill matrix for Q3 2026.");
  });
  it("tells no one when whoever filled it in is no longer on record", () => {
    expect(skillNotification("skill.approved", { ...M, evaluatorId: null }, "Nor Azlina")).toBeNull();
  });
});

describe("TNA notifications", () => {
  const OWN = { id: 3, year: 2026, staffId: 233, gradeName: "", filledById: 233 };
  const GRADE = { id: 4, year: 2026, staffId: null, gradeName: "Job grade 4, Stamping", filledById: 103 };
  it("tells the person about their own, and leads to My TNA for that year", () => {
    expect(tnaNotification("tna.returned", OWN, "Nor Azlina")).toMatchObject({ staffId: 233, href: "/my-tna?year=2026", title: "Nor Azlina sent your TNA for 2026 back to you." });
    expect(tnaNotification("tna.approved", OWN, "Nor Azlina")!.title).toBe("Nor Azlina approved your TNA for 2026.");
    expect(tnaNotification("tna.reopened", OWN, "L&D")!.title).toBe("L&D reopened your TNA for 2026. Change it and submit it again.");
  });
  it("tells the main clerk who filled in a job grade's, and leads to its record", () => {
    expect(tnaNotification("tna.returned", GRADE, "Nor Azlina")).toMatchObject({ staffId: 103, href: "/tna/4", title: "Nor Azlina sent the TNA for Job grade 4, Stamping, 2026 back to you." });
  });
  it("tells no one about a job grade's that no one on record filled in", () => {
    expect(tnaNotification("tna.approved", { ...GRADE, filledById: null }, "Nor Azlina")).toBeNull();
  });
});

describe("writing them", () => {
  it("never tells someone about their own action, and skips the ones with no one to tell", () => {
    const own = tnaNotification("tna.approved", { id: 3, year: 2026, staffId: 233, gradeName: "", filledById: 233 }, "Nor Azlina")!;
    const other = { ...own, staffId: 250 };
    expect(notificationsToWrite([own, null, other], 233)).toEqual([other]);
    expect(notificationsToWrite([null], 1)).toEqual([]);
  });
  it("marks the kinds that ask the person to do something", () => {
    for (const k of ["pme.evaluated", "pme.returned", "skill.returned", "tna.returned", "tna.reopened"]) expect(notificationAsks(k)).toBe(true);
    for (const k of ["pme.verified", "skill.approved", "tna.approved", "something.else"]) expect(notificationAsks(k)).toBe(false);
  });
  it("keeps a long title within the column", () => {
    const n = pmeNotification("pme.verified", { ...PME, training: "x".repeat(300) }, null)!;
    expect(n.title).toHaveLength(200);
    expect(n.title.endsWith("…")).toBe(true);
  });
  it("only follows links inside LDMS", () => {
    expect(safeNotificationHref("/my-tna?year=2026")).toBe("/my-tna?year=2026");
    expect(safeNotificationHref("https://example.com")).toBe("/notifications");
    expect(safeNotificationHref("//example.com")).toBe("/notifications");
  });
});
