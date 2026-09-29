// Development seed: settings plus a demo org chart and staff list.
// Real data comes from scripts/legacy-import in phase 5; this is only so the
// screens have something realistic to show. Runs only on an empty database.

import { PrismaClient, type Designation, type RoleCode } from "@prisma/client";
import { hash } from "@node-rs/argon2";
import { createHash } from "node:crypto";

const db = new PrismaClient();

// Deterministic PRNG so every developer gets the same demo data.
let seed = 20260924;
const rand = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};
const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)];

const MALAY_M = ["Mohd Faizal", "Ahmad Zulkifli", "Muhammad Hafiz", "Mohd Azrul", "Khairul Anuar", "Shahrul Nizam", "Mohd Firdaus", "Amirul Hakim", "Syed Hazwan", "Mohd Rizal", "Azman", "Hairi"];
const MALAY_F = ["Nurul Aina", "Siti Hajar", "Nor Azlina", "Farah Wahida", "Nurul Izzah", "Aisyah", "Rohana", "Nur Syafiqah"];
const MALAY_FATHER = ["Ahmad", "Rosli", "Hassan", "Kamarudin", "Ismail", "Othman", "Abdullah", "Yusof", "Hamid", "Jaafar", "Salleh", "Mat Isa"];
const CHINESE = ["Tan Wei Liang", "Lim Chee Keong", "Wong Mei Ling", "Ng Kah Hoe", "Chong Siew Yin", "Lee Jun Hao", "Ooi Boon Kiat", "Teh Pei Shan", "Goh Chin Wei", "Yap Soon Huat", "Low Kai Xuan"];
const INDIAN_M = ["Muthu", "Saravanan", "Rajesh", "Kumaresan", "Vinod", "Ganesan"];
const INDIAN_F = ["Kavitha", "Thilagavathy", "Priya", "Sharmila"];
const INDIAN_FATHER = ["Ramasamy", "Subramaniam", "Krishnan", "Muniandy", "Arumugam", "Raman"];
const FOREIGN = ["Rahim Uddin", "Min Thant Zaw", "Bishnu Tamang", "Aung Ko Ko", "Md Shohel Rana", "Hari Bahadur Gurung"];

function personName(contract: boolean): string {
  if (contract && rand() < 0.6) return pick(FOREIGN);
  const r = rand();
  if (r < 0.34) return `${pick(MALAY_M)} bin ${pick(MALAY_FATHER)}`;
  if (r < 0.52) return `${pick(MALAY_F)} binti ${pick(MALAY_FATHER)}`;
  if (r < 0.8) return pick(CHINESE);
  if (r < 0.92) return `${pick(INDIAN_M)} a/l ${pick(INDIAN_FATHER)}`;
  return `${pick(INDIAN_F)} a/p ${pick(INDIAN_FATHER)}`;
}

function emailFor(name: string, staffNo: string): string {
  const base = name
    .replace(/\b(bin|binti|a\/l|a\/p|mohd|muhammad|md)\b/gi, "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .join(".")
    .toLowerCase()
    .replace(/[^a-z.]/g, "");
  return `${base || staffNo}@phn.com.my`;
}

const md5 = (s: string) => createHash("md5").update(s).digest("hex");

const POSITIONS: Record<Designation, string[]> = {
  MANAGER: ["Manager", "Assistant Manager", "Senior Manager"],
  EXECUTIVE: ["Engineer", "Senior Engineer", "Executive", "Senior Executive"],
  NON_EXECUTIVE: ["Technician", "Production Operator", "Line Leader", "Clerk", "Inspector", "Senior Technician"],
  CONTRACT: ["Production Operator"],
  TRAINEE: ["Graduate Trainee", "Industrial Trainee"],
};

type DeptSpec = {
  name: string;
  short: string;
  sections: string[];
  mix: Partial<Record<Designation, number>>;
  noHod?: boolean;
};

const ORG: { name: string; short: string; departments: DeptSpec[] }[] = [
  {
    name: "Manufacturing",
    short: "MFG",
    departments: [
      { name: "Stamping", short: "STP", sections: ["Press Line A", "Press Line B", "Die Setting"], mix: { MANAGER: 1, EXECUTIVE: 3, NON_EXECUTIVE: 12, CONTRACT: 9 } },
      { name: "Welding & Assembly", short: "WLD", sections: ["Robotic Welding", "Spot Welding", "Sub-Assembly"], mix: { MANAGER: 1, EXECUTIVE: 3, NON_EXECUTIVE: 10, CONTRACT: 8 } },
      { name: "Production Planning & Control", short: "PPC", sections: ["Planning", "Store & Logistics"], mix: { MANAGER: 1, EXECUTIVE: 2, NON_EXECUTIVE: 5 } },
      { name: "Maintenance", short: "MTN", sections: ["Mechanical", "Electrical"], mix: { MANAGER: 1, EXECUTIVE: 2, NON_EXECUTIVE: 6 } },
    ],
  },
  {
    name: "Engineering",
    short: "ENG",
    departments: [
      { name: "Die Engineering", short: "DIE", sections: ["Die Design", "Tryout"], mix: { MANAGER: 1, EXECUTIVE: 4, NON_EXECUTIVE: 3, TRAINEE: 2 } },
      { name: "Product Engineering", short: "PED", sections: [], mix: { MANAGER: 1, EXECUTIVE: 4, TRAINEE: 1 } },
      { name: "Tooling Workshop", short: "TWS", sections: [], mix: { EXECUTIVE: 1, NON_EXECUTIVE: 5 }, noHod: true },
    ],
  },
  {
    name: "Quality",
    short: "QLT",
    departments: [
      { name: "Quality Assurance", short: "QA", sections: ["Supplier Quality", "Customer Quality"], mix: { MANAGER: 1, EXECUTIVE: 4, NON_EXECUTIVE: 2 } },
      { name: "Quality Control", short: "QC", sections: ["Incoming Inspection", "In-Process", "Final Inspection"], mix: { MANAGER: 1, EXECUTIVE: 2, NON_EXECUTIVE: 8, CONTRACT: 3 } },
    ],
  },
  {
    name: "Corporate Services",
    short: "CSV",
    departments: [
      { name: "Human Resources & Administration", short: "HRA", sections: ["Human Resources", "Learning & Development", "General Affairs"], mix: { MANAGER: 1, EXECUTIVE: 4, NON_EXECUTIVE: 3 } },
      { name: "Finance & Accounts", short: "FIN", sections: [], mix: { MANAGER: 1, EXECUTIVE: 3, NON_EXECUTIVE: 2 } },
      { name: "Purchasing", short: "PUR", sections: [], mix: { MANAGER: 1, EXECUTIVE: 2, NON_EXECUTIVE: 1 } },
      { name: "Information Technology", short: "IT", sections: [], mix: { MANAGER: 1, EXECUTIVE: 2 } },
    ],
  },
];

const DEMO_PASSWORD = "Ldms@2026";

async function main() {
  await db.setting.upsert({
    where: { key: "tna.year" },
    update: {},
    create: { key: "tna.year", value: 2026 },
  });
  await db.setting.upsert({
    where: { key: "mail.testMode" },
    update: {},
    create: { key: "mail.testMode", value: { enabled: true, address: "ldms-test@phn.com.my" } },
  });

  if ((await db.staff.count()) > 0) {
    console.log("Staff table is not empty, skipping demo data.");
    return;
  }

  const demoHash = await hash(DEMO_PASSWORD);
  let permanentNo = 10231;
  let contractNo = 2041;
  let traineeNo = 311;

  for (const div of ORG) {
    const division = await db.division.create({ data: { name: div.name, shortName: div.short } });

    for (const spec of div.departments) {
      const department = await db.department.create({
        data: { name: spec.name, shortName: spec.short, divisionId: division.id },
      });
      const sections = await Promise.all(
        spec.sections.map((name) => db.section.create({ data: { name, departmentId: department.id } })),
      );

      let hodId: number | null = null;
      for (const [designation, count] of Object.entries(spec.mix) as [Designation, number][]) {
        for (let i = 0; i < count; i++) {
          const contract = designation === "CONTRACT";
          const staffNo = contract
            ? `C${contractNo++}`
            : designation === "TRAINEE"
              ? `T0${traineeNo++}`
              : String(permanentNo++);
          const name = personName(contract);
          const resigned = rand() < 0.07 && designation !== "MANAGER";
          const joinedYear = designation === "TRAINEE" ? 2026 : 2008 + Math.floor(rand() * 18);
          const dateJoined = new Date(Date.UTC(joinedYear, Math.floor(rand() * 12), 1 + Math.floor(rand() * 27)));
          const hasEmail = designation === "MANAGER" || designation === "EXECUTIVE" || (designation === "NON_EXECUTIVE" && rand() < 0.25);

          const staff = await db.staff.create({
            data: {
              staffNo,
              name,
              email: hasEmail ? emailFor(name, staffNo) : null,
              position: designation === "MANAGER" && i === 0 ? `Manager, ${spec.name}` : pick(POSITIONS[designation]),
              designation,
              status: resigned ? "RESIGNED" : "ACTIVE",
              dateJoined,
              dateResigned: resigned ? new Date(Date.UTC(2026, Math.floor(rand() * 8), 1 + Math.floor(rand() * 27))) : null,
              departmentId: department.id,
              sectionId: sections.length && designation !== "MANAGER" ? pick(sections).id : null,
              // Everyone else signs in with a migrated MD5 password, as they will after cutover.
              legacyMd5: md5("phn12345"),
            },
          });
          if (designation === "MANAGER" && hodId === null && !spec.noHod) hodId = staff.id;
        }
      }
      if (hodId) await db.department.update({ where: { id: department.id }, data: { hodId } });
    }

    // Division head: a senior manager placed in the first department of the division.
    const firstDept = await db.department.findFirstOrThrow({ where: { divisionId: division.id }, orderBy: { id: "asc" } });
    const head = await db.staff.create({
      data: {
        staffNo: String(permanentNo++),
        name: personName(false),
        position: `General Manager, ${div.name}`,
        designation: "MANAGER",
        departmentId: firstDept.id,
        dateJoined: new Date(Date.UTC(2004 + Math.floor(rand() * 6), 2, 1)),
        legacyMd5: md5("phn12345"),
      },
    });
    await db.staff.update({ where: { id: head.id }, data: { email: emailFor(head.name, head.staffNo) } });
    await db.division.update({ where: { id: division.id }, data: { headId: head.id } });
  }

  // Demo sign-ins with known passwords.
  const hra = await db.department.findFirstOrThrow({ where: { shortName: "HRA" }, include: { sections: true } });
  const ldSection = hra.sections.find((s) => s.name === "Learning & Development")!;
  const stamping = await db.department.findFirstOrThrow({ where: { shortName: "STP" } });

  const accounts: { staffNo: string; name: string; position: string; designation: Designation; departmentId: number; sectionId?: number; roles: RoleCode[] }[] = [
    { staffNo: "10001", name: "Nor Azlina binti Hamid", position: "Senior Executive, Learning & Development", designation: "EXECUTIVE", departmentId: hra.id, sectionId: ldSection.id, roles: ["LD_ADMIN"] },
    { staffNo: "10002", name: "Farah Wahida binti Yusof", position: "Clerk, Learning & Development", designation: "NON_EXECUTIVE", departmentId: hra.id, sectionId: ldSection.id, roles: ["MAIN_CLERK"] },
    { staffNo: "10003", name: "Ooi Boon Kiat", position: "Clerk, Production", designation: "NON_EXECUTIVE", departmentId: stamping.id, roles: ["CLERK"] },
  ];
  for (const a of accounts) {
    await db.staff.create({
      data: {
        staffNo: a.staffNo,
        name: a.name,
        email: emailFor(a.name, a.staffNo),
        position: a.position,
        designation: a.designation,
        departmentId: a.departmentId,
        sectionId: a.sectionId,
        dateJoined: new Date(Date.UTC(2017, 3, 3)),
        passwordHash: demoHash,
        roles: { create: a.roles.map((role) => ({ role })) },
      },
    });
  }
  // The Stamping HOD also gets the demo password so the HOD view can be tried.
  if (stamping.hodId) await db.staff.update({ where: { id: stamping.hodId }, data: { passwordHash: demoHash, legacyMd5: null } });

  const count = await db.staff.count();
  const hod = stamping.hodId ? await db.staff.findUnique({ where: { id: stamping.hodId } }) : null;
  console.log(`Seeded ${count} staff.`);
  console.log(`Sign in with password ${DEMO_PASSWORD}: 10001 (L&D admin), 10002 (main clerk), 10003 (clerk)${hod ? `, ${hod.staffNo} (HOD Stamping)` : ""}.`);
  console.log(`Everyone else has the migrated MD5 password "phn12345", upgraded to argon2 on first sign-in.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
