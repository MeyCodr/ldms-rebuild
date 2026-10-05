import type { Metadata } from "next";
import { PageHeader } from "@/components/PageHeader";
import { isAdmin } from "@/server/permissions";
import { requirePermission } from "@/server/session";
import { OjtImportFlow } from "./OjtImportFlow";

export const metadata: Metadata = { title: "Import OJT" };

export default async function ImportOjtPage() {
  const user = await requirePermission("ojt.manage");
  return (
    <div>
      <PageHeader module="ojt" context={{ href: "/ojt", label: "OJT" }} title="Import OJT from Excel" />
      <div className="mt-5">
        <OjtImportFlow contractOnly={!isAdmin(user)} done={{ href: "/ojt", label: "View OJT records" }} />
      </div>
    </div>
  );
}
