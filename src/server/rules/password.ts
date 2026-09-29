// Legacy password handling. The PHP system stored unsalted MD5 hashes.
// Migrated staff keep the MD5 value in Staff.legacyMd5 until their first
// successful sign-in, when it is replaced by an argon2id hash.

import { createHash, timingSafeEqual } from "node:crypto";

export function md5Hex(value: string): string {
  return createHash("md5").update(value, "utf8").digest("hex");
}

export function matchesLegacyMd5(password: string, storedMd5: string): boolean {
  const a = Buffer.from(md5Hex(password), "utf8");
  const b = Buffer.from(storedMd5.trim().toLowerCase(), "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export const PASSWORD_MIN_LENGTH = 8;

export function passwordProblems(password: string, staffNo: string): string[] {
  const problems: string[] = [];
  if (password.length < PASSWORD_MIN_LENGTH) problems.push(`At least ${PASSWORD_MIN_LENGTH} characters`);
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) problems.push("Both letters and numbers");
  if (password.toLowerCase().includes(staffNo.toLowerCase())) problems.push("Must not contain your staff number");
  return problems;
}
