import { describe, expect, it } from "vitest";
import { isActiveHeadcount } from "@/server/rules/headcount";

describe("isActiveHeadcount", () => {
  it.each([
    ["ACTIVE", "EXECUTIVE", true],
    ["ACTIVE", "NON_EXECUTIVE", true],
    ["ACTIVE", "MANAGER", true],
    ["ACTIVE", "CONTRACT", true],
    ["ACTIVE", "TRAINEE", false],
    ["RESIGNED", "EXECUTIVE", false],
    ["RESIGNED", "TRAINEE", false],
  ] as const)("%s %s → %s", (status, designation, expected) => {
    expect(isActiveHeadcount({ status, designation })).toBe(expected);
  });
});
