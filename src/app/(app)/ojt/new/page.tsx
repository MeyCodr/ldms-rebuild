import type { Metadata } from "next";
import { PageHeader } from "@/components/PageHeader";
import { nowInMalaysia, toDateInput } from "@/lib/format";
import { isAdmin } from "@/server/permissions";
import { ojtCandidates } from "@/server/services/ojt";
import { requirePermission } from "@/server/session";
import { OjtEntryForm } from "./OjtEntryForm";

export const metadata: Metadata = { title: "Record OJT" };

export default async function RecordOjtPage() {
  const user = await requirePermission("ojt.manage");
  const { staff, departments } = await ojtCandidates(user);
  return (
    <div>
      <PageHeader
        module="ojt"
        context={{ href: "/ojt", label: "OJT" }}
        title="Record OJT"
        meta={<span>One OJT for one or more staff. It must have taken place by today.</span>}
      />
      <OjtEntryForm staff={staff} departments={departments} today={toDateInput(nowInMalaysia())} contractOnly={!isAdmin(user)} />
    </div>
  );
}
