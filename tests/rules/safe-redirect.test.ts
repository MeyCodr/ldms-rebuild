import { describe, expect, it } from "vitest";
import { safeRedirect } from "@/lib/safe-redirect";

describe("safeRedirect", () => {
  it.each([
    ["/staff", "/staff"],
    ["/staff?departmentId=3&page=2", "/staff?departmentId=3&page=2"],
    ["/organization/departments/4", "/organization/departments/4"],
  ])("keeps a path on this site: %s", (from, expected) => {
    expect(safeRedirect(from)).toBe(expected);
  });

  it.each([
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "\\\\evil.example",
    "/\tevil.example",
    "javascript:alert(1)",
    "evil.example",
    "/login",
    "/login?from=/staff",
    "",
    undefined,
    null,
    42,
  ])("sends anything else to the overview: %s", (from) => {
    expect(safeRedirect(from)).toBe("/");
  });
});
