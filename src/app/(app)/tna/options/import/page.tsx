import type { Metadata } from "next";
import { PageHeader } from "@/components/PageHeader";
import { Panel } from "@/components/Panel";
import { requirePermission } from "@/server/session";
import { OptionImportFlow } from "./OptionImportFlow";

export const metadata: Metadata = { title: "Import TNA training options" };

export default async function ImportTnaOptionsPage() {
  await requirePermission("tna.manage");
  return (
    <div>
      <PageHeader module="tna" context={{ href: "/tna/options", label: "Training options" }} title="Import training options" />
      <Panel title="From Excel" description="Change many options at once: add, rename, hide, regroup and reorder. Nothing is saved until you have checked the changes.">
        <OptionImportFlow />
      </Panel>
    </div>
  );
}
