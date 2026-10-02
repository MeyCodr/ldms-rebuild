import type { Metadata } from "next";
import { PageHeader } from "@/components/PageHeader";
import { isAdmin } from "@/server/permissions";
import { requirePermission } from "@/server/session";
import { ImportFlow } from "./ImportFlow";

export const metadata: Metadata = { title: "Import staff" };

export default async function ImportStaffPage() {
  const user = await requirePermission("staff.import");
  return (
    <div className="mx-auto max-w-[1580px]">
      <PageHeader module="staff" context={{ href: "/staff", label: "Staff" }} title="Import staff from Excel" />
      <div className="mt-5">
        <ImportFlow contractOnly={!isAdmin(user)} />
      </div>
    </div>
  );
}
