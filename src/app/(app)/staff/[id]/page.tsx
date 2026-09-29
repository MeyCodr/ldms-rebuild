import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { RoleCode } from "@prisma/client";
import { Avatar, DivisionMark } from "@/components/brand";
import { PageHeader } from "@/components/PageHeader";
import { Panel } from "@/components/Panel";
import { Status, StaffStatus } from "@/components/ui/Status";
import { formatDate, formatDateTime, plural, yearsOfService } from "@/lib/format";
import { divisionTone } from "@/lib/tones";
import { DESIGNATION_LABELS } from "@/lib/validation/staff";
import { can, canManageStaffRecord, ROLE_DESCRIPTIONS, ROLE_LABELS } from "@/server/permissions";
import { approverReasonLabel, hasNoApproverByDesign } from "@/server/rules/approver";
import { approverFor, approvesCount } from "@/server/services/approver";
import { getStaffRecord, recordHistory } from "@/server/services/staff";
import { requireUser } from "@/server/session";
import { ReinstateDialog, ResetPasswordDialog, ResignDialog, RolesForm } from "./RecordActions";

export const metadata: Metadata = { title: "Staff record" };

const SAVED: Record<string, string> = { created: "Staff record added.", updated: "Changes saved." };

export default async function StaffRecordPage({ params, searchParams }: PageProps<"/staff/[id]">) {
  const user = await requireUser();
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const staff = await getStaffRecord(user, id);
  if (!staff) notFound();

  const { saved } = await searchParams;
  const [approver, approves, history] = await Promise.all([
    staff.status === "ACTIVE" ? approverFor(id) : Promise.resolve(null),
    staff.status === "ACTIVE" ? approvesCount(id) : Promise.resolve(0),
    can(user, "staff.manage") || can(user, "audit.view") ? recordHistory(id) : Promise.resolve([]),
  ]);
  const manage = canManageStaffRecord(user, staff);
  const active = staff.status === "ACTIVE";
  const heads = [...staff.hodOf.map((d) => `HOD of ${d.name}`), ...staff.headOf.map((d) => `head of ${d.name}`)];

  return (
    <div className="mx-auto max-w-[1180px]">
      <PageHeader module="staff"
        context={{ href: "/staff", label: "Staff" }}
        title={staff.name}
        leading={<Avatar name={staff.name} tone={divisionTone(staff.department.division.id)} size={46} />}
        meta={
          <>
            <span className="num">{staff.staffNo}</span>
            <span>{DESIGNATION_LABELS[staff.designation]}</span>
            <StaffStatus status={staff.status} />
          </>
        }
        actions={
          manage && (
            <>
              <Link href={`/staff/${id}/edit`} className="btn">
                Edit
              </Link>
              <ResetPasswordDialog id={id} name={staff.name} staffNo={staff.staffNo} />
              {/* Both stay mounted so a dialog's result is still shown after the status flips. */}
              {staff.id !== user.id && (
                <ResignDialog
                  id={id}
                  name={staff.name}
                  hidden={!active}
                  hodNote={heads.length ? `${staff.name} is ${heads.join(" and ")}. That assignment will be removed; choose a replacement in Organization afterwards.` : undefined}
                />
              )}
              <ReinstateDialog id={id} name={staff.name} hidden={active} />
            </>
          )
        }
      />

      {typeof saved === "string" && SAVED[saved] && (
        <div role="status" className="notice notice-ok mt-4">
          {SAVED[saved]}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-5">
          <Sheet title="Employment">
            <Item label="Department">
              <DivisionMark tone={divisionTone(staff.department.division.id)} className="mr-2" />
              {can(user, "org.view") ? (
                <Link href={`/organization/departments/${staff.departmentId}`} className="link">
                  {staff.department.name}
                </Link>
              ) : (
                staff.department.name
              )}
              <span className="text-ink-3"> · {staff.department.division.name}</span>
            </Item>
            <Item label="Section">{staff.section?.name ?? <span className="text-ink-3">None</span>}</Item>
            <Item label="Position">{staff.position ?? <span className="text-ink-3">Not recorded</span>}</Item>
            <Item label="Designation">{DESIGNATION_LABELS[staff.designation]}</Item>
            <Item label="Date joined">
              {staff.dateJoined ? (
                <>
                  <span className="num">{formatDate(staff.dateJoined)}</span>
                  <span className="text-ink-3"> · {yearsOfService(staff.dateJoined, staff.dateResigned)}</span>
                </>
              ) : (
                <span className="text-ink-3">Not recorded</span>
              )}
            </Item>
            {staff.dateResigned && (
              <Item label="Last working day">
                <span className="num">{formatDate(staff.dateResigned)}</span>
              </Item>
            )}
            <Item label="Email">{staff.email ? <a href={`mailto:${staff.email}`} className="link">{staff.email}</a> : <span className="text-ink-3">None</span>}</Item>
          </Sheet>

          {active && (
            <Sheet title="Reporting line">
              <Item label="Approver">
                {approver?.approverId && approver.approver ? (
                  <>
                    <Link href={`/staff/${approver.approver.id}`} className="link">
                      {approver.approver.name}
                    </Link>
                    <span className="text-ink-3"> · HOD of the department</span>
                  </>
                ) : approver?.basis === "NONE" ? (
                  <Status tone={hasNoApproverByDesign(approver) ? "na" : "wait"}>{approverReasonLabel[approver.reason]}</Status>
                ) : null}
              </Item>
              {heads.length > 0 && <Item label="Heads">{heads.map((h) => h[0].toUpperCase() + h.slice(1)).join("; ")}</Item>}
              {approves > 0 && <Item label="Approves for">{plural(approves, "active staff member", "active staff")}</Item>}
            </Sheet>
          )}

          {history.length > 0 && (
            <Panel title="History" flush>
              <ol className="px-5 text-[13px]">
                {history.map((h) => (
                  <li key={String(h.id)} className="grid gap-x-4 border-b border-rule py-2.5 last:border-b-0 sm:grid-cols-[150px_1fr]">
                    <div className="num text-xs text-ink-3 sm:pt-0.5">{formatDateTime(h.createdAt)}</div>
                    <div>
                      {h.summary}
                      <span className="text-ink-3"> · {h.actor?.name ?? "System"}</span>
                      {h.changes && typeof h.changes === "object" && !Array.isArray(h.changes) && (
                        <ul className="mt-0.5 text-xs text-ink-2">
                          {Object.entries(h.changes as Record<string, [unknown, unknown]>).map(([k, [a, b]]) => (
                            <li key={k}>
                              {k}: <span className="text-ink-3">{String(a ?? "blank")}</span> → {String(b ?? "blank")}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            </Panel>
          )}
        </div>

        <aside className="flex flex-col gap-5">
          <Sheet title="Sign-in">
            <div className="py-3 text-[13px]">
              {!active ? (
                <Status tone="na">Cannot sign in (resigned)</Status>
              ) : staff.mustChangePassword ? (
                <Status tone="wait">Temporary password, must change at next sign-in</Status>
              ) : staff.passwordHash ? (
                <Status tone="ok">Has a v2 password</Status>
              ) : staff.legacyMd5 ? (
                <Status tone="na">Migrated password, not signed in to v2 yet</Status>
              ) : (
                <Status tone="bad">No password, cannot sign in</Status>
              )}
              <div className="mt-1 text-xs text-ink-3">
                Last sign-in: {staff.lastSignInAt ? <span className="num">{formatDateTime(staff.lastSignInAt)}</span> : "never"}
              </div>
            </div>
          </Sheet>

          <Panel title="Access">
            <div>
              {can(user, "staff.roles") && active ? (
                <RolesForm
                  id={id}
                  current={staff.roles.map((r) => r.role)}
                  options={(Object.keys(ROLE_LABELS) as RoleCode[]).map((code) => ({ code, label: ROLE_LABELS[code], description: ROLE_DESCRIPTIONS[code] }))}
                />
              ) : (
                <p className="text-[13px]">{staff.roles.length ? staff.roles.map((r) => ROLE_LABELS[r.role]).join(", ") : "Staff (no extra roles)"}</p>
              )}
              <p className="mt-3 text-xs text-ink-3">HOD and division-head access comes from Organization, not from roles.</p>
            </div>
          </Panel>
        </aside>
      </div>
    </div>
  );
}

function Sheet({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Panel title={title}>
      <dl className="-my-2 text-[13.5px]">{children}</dl>
    </Panel>
  );
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[130px_1fr] gap-3 border-b border-rule py-2 last:border-b-0 sm:grid-cols-[160px_1fr]">
      <dt className="text-ink-3">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}
