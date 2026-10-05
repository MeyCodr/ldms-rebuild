import type { Metadata } from "next";
import { forbidden } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { can, isAdmin } from "@/server/permissions";
import { requirePermission } from "@/server/session";
import { OjtImportFlow } from "../../ojt/import/OjtImportFlow";

export const metadata: Metadata = { title: "Import OJT" };

/** L&D's way into the OJT import: the same file and checks as the clerks' OJT page. */
export default async function ImportTrainingsPage() {
  const user = await requirePermission("training.manage");
  if (!can(user, "ojt.manage")) forbidden();
  return (
    <div>
      <PageHeader module="training" context={{ href: "/trainings", label: "Trainings" }} title="Import OJT from Excel" />
      <div className="mt-5">
        <OjtImportFlow contractOnly={!isAdmin(user)} done={{ href: "/trainings?type=OJT", label: "View OJT trainings" }} />
      </div>
    </div>
  );
}
