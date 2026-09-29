import "server-only";
import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { hash, verify } from "@node-rs/argon2";
import { z } from "zod";
import { db } from "./db";
import { matchesLegacyMd5 } from "./rules/password";

class LockedOut extends CredentialsSignin {
  code = "locked";
}

// Failed sign-in counter per staff no. In memory is enough for one PM2
// process; move it to the database if the app is ever run as a cluster.
const failures = new Map<string, { count: number; until: number }>();
const MAX_FAILURES = 5;
const LOCK_MS = 10 * 60 * 1000;

// Checked against when there is no argon2 hash to verify, so every failed
// sign-in costs the same time and response times don't reveal which staff
// numbers exist.
let dummyHash: Promise<string> | undefined;
const burnVerify = async (password: string) => {
  dummyHash ??= hash("ldms-timing-equaliser");
  await verify(await dummyHash, password).catch(() => false);
};

const credentialsSchema = z.object({
  staffNo: z.string().trim().min(1).max(20).transform((s) => s.toUpperCase()),
  password: z.string().min(1).max(200),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt", maxAge: 10 * 60 * 60 },
  pages: { signIn: "/login" },
  trustHost: true,
  providers: [
    Credentials({
      credentials: { staffNo: {}, password: {} },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { staffNo, password } = parsed.data;

        const now = Date.now();
        const lock = failures.get(staffNo);
        if (lock && lock.until <= now) failures.delete(staffNo); // lock period over: start counting again
        else if (lock && lock.count >= MAX_FAILURES) throw new LockedOut();

        const staff = await db.staff.findUnique({ where: { staffNo } });
        let ok = false;
        if (staff && staff.status === "ACTIVE" && staff.passwordHash) {
          ok = await verify(staff.passwordHash, password);
        } else if (staff && staff.status === "ACTIVE" && staff.legacyMd5 && matchesLegacyMd5(password, staff.legacyMd5)) {
          ok = true;
          // First sign-in on v2: replace the MD5 hash with argon2id.
          await db.staff.update({ where: { id: staff.id }, data: { passwordHash: await hash(password), legacyMd5: null } });
        } else {
          await burnVerify(password);
        }

        if (!ok || !staff) {
          const prev = failures.get(staffNo);
          failures.set(staffNo, { count: (prev?.count ?? 0) + 1, until: now + LOCK_MS });
          return null;
        }

        failures.delete(staffNo);
        await db.staff.update({ where: { id: staff.id }, data: { lastSignInAt: new Date() } });
        return { id: String(staff.id), name: staff.name, sessionVersion: staff.sessionVersion };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) {
        token.sub = user.id;
        // Compared with Staff.sessionVersion on every request (see session.ts).
        token.sv = (user as { sessionVersion?: number }).sessionVersion ?? 0;
      }
      return token;
    },
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      (session as { sv?: number }).sv = typeof token.sv === "number" ? token.sv : -1;
      return session;
    },
  },
});
