// Manpower headcount used for HOD dashboards and "average hours per head".
// Old system (staff/hod/fetch_dash.php): not resigned and not TRAINEE; a blank
// status counted as active. Blank statuses are mapped to ACTIVE on import, so
// the enum is enough here.

import type { Designation, StaffStatus } from "@prisma/client";

export function isActiveHeadcount(staff: { status: StaffStatus; designation: Designation }): boolean {
  return staff.status === "ACTIVE" && staff.designation !== "TRAINEE";
}
