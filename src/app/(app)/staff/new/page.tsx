import type { Metadata } from "next";
import { PageHeader } from "@/components/PageHeader";
import { manageableDesignations } from "@/server/permissions";
import { departmentOptions } from "@/server/services/org";
import { requirePermission } from "@/server/session";
import { createStaffAction } from "../actions";
import { StaffForm } from "../StaffForm";

export const metadata: Metadata = { title: "Add staff" };

export default async function NewStaffPage() {
  const user = await requirePermission("staff.manage");
  const designations = manageableDesignations(user);
  const departments = await departmentOptions();

  return (
    <div className="mx-auto max-w-[1700px]">
      <PageHeader module="staff" context={{ href: "/staff", label: "Staff" }} title="Add staff" />
      <div className="mt-5">
        <StaffForm
          action={createStaffAction}
          departments={departments}
          designations={designations}
          submitLabel="Add staff"
          cancelHref="/staff"
          initial={{
            staffNo: "",
            name: "",
            email: "",
            position: "",
            designation: designations.length === 1 ? designations[0] : "",
            departmentId: "",
            sectionId: "",
            dateJoined: "",
          }}
        />
        <p className="mt-6 max-w-[720px] text-xs text-ink-3">
          New staff have no password. Reset it from their record to give them a temporary password for their first sign-in.
        </p>
      </div>
    </div>
  );
}
