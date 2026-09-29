import { describe, expect, it } from "vitest";
import { matchesLegacyMd5, md5Hex, passwordProblems } from "@/server/rules/password";

describe("legacy MD5 passwords", () => {
  const stored = "5f4dcc3b5aa765d61d8327deb882cf99"; // md5("password"), as the PHP system stored it

  it("matches the password the old system hashed", () => {
    expect(md5Hex("password")).toBe(stored);
    expect(matchesLegacyMd5("password", stored)).toBe(true);
  });

  it("tolerates upper-case or padded values from the old column", () => {
    expect(matchesLegacyMd5("password", ` ${stored.toUpperCase()} `)).toBe(true);
  });

  it("rejects a wrong password and a malformed hash", () => {
    expect(matchesLegacyMd5("Password", stored)).toBe(false);
    expect(matchesLegacyMd5("password", "abc")).toBe(false);
  });
});

describe("passwordProblems", () => {
  it("accepts a reasonable password", () => {
    expect(passwordProblems("Stamping2026", "10231")).toEqual([]);
  });

  it("rejects short, letters-only and staff-number passwords", () => {
    expect(passwordProblems("abc1", "10231")).toContain("At least 8 characters");
    expect(passwordProblems("onlyletters", "10231")).toContain("Both letters and numbers");
    expect(passwordProblems("phn10231x", "10231")).toContain("Must not contain your staff number");
  });
});
