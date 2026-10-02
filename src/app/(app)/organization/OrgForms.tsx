"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { CancelButton, DialogButton } from "@/components/ui/Dialog";
import { Field, fieldProps, FormMessage, SubmitButton, useFormAction } from "@/components/ui/forms";
import { Select, type SelectOption } from "@/components/ui/Select";
import type { ActionState } from "@/lib/action-state";
import { DESIGNATION_LABELS } from "@/lib/validation/staff";

type Action = (prev: ActionState, fd: FormData) => Promise<ActionState>;

function DialogFooter({ pending, submit, variant = "primary", ok }: { pending: boolean; submit: string; variant?: "primary" | "danger"; ok: boolean }) {
  return (
    <div className="flex justify-end gap-2 border-t border-rule pt-4">
      <CancelButton label={ok ? "Close" : "Cancel"} />
      {!ok && (
        <SubmitButton pending={pending} variant={variant}>
          {submit}
        </SubmitButton>
      )}
    </div>
  );
}

// ---------- Name + short name (divisions and departments) ----------

export function NameDialog({
  label,
  title,
  description,
  action,
  initial,
  divisions,
  submit,
  variant = "secondary",
  size,
}: {
  label: string;
  title: string;
  description?: string;
  action: Action;
  initial?: { name: string; shortName: string | null; divisionId?: number };
  divisions?: { id: number; name: string }[];
  submit: string;
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm";
}) {
  return (
    <DialogButton label={label} title={title} description={description} variant={variant} size={size}>
      <NameForm action={action} initial={initial} divisions={divisions} submit={submit} />
    </DialogButton>
  );
}

function NameForm({ action, initial, divisions, submit }: { action: Action; initial?: { name: string; shortName: string | null; divisionId?: number }; divisions?: { id: number; name: string }[]; submit: string }) {
  const { state, onSubmit, pending } = useFormAction(action);
  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <FormMessage state={state} />
      <div className="grid gap-4 sm:grid-cols-[1fr_110px]">
        <Field label="Name" name="name" required state={state}>
          <input {...fieldProps("name", state)} defaultValue={initial?.name} className="input" maxLength={120} autoFocus />
        </Field>
        <Field label="Short name" name="shortName" state={state} hint="Used in tight spaces.">
          <input {...fieldProps("shortName", state)} defaultValue={initial?.shortName ?? ""} className="input num uppercase" maxLength={20} />
        </Field>
      </div>
      {divisions && (
        <Field label="Division" name="divisionId" required state={state} hint="Moves the department and its staff to another division.">
          <Select
            {...fieldProps("divisionId", state)}
            defaultValue={initial?.divisionId ? String(initial.divisionId) : ""}
            options={divisions.map((d) => ({ value: String(d.id), label: d.name }))}
          />
        </Field>
      )}
      <DialogFooter pending={pending} submit={submit} ok={state.status === "ok"} />
    </form>
  );
}

// ---------- HOD / division head ----------

export type Candidate = { id: number; name: string; staffNo: string; designation: string; department: { name: string } };

export function HeadDialog({
  label,
  title,
  description,
  action,
  currentId,
  candidates,
  preferDepartment,
  variant = "secondary",
}: {
  label: string;
  title: string;
  description?: React.ReactNode;
  action: Action;
  currentId: number | null;
  candidates: Candidate[];
  preferDepartment?: string;
  variant?: "primary" | "secondary";
}) {
  return (
    <DialogButton label={label} title={title} description={description} size="sm" width={480} variant={variant}>
      <HeadForm action={action} currentId={currentId} candidates={candidates} preferDepartment={preferDepartment} />
    </DialogButton>
  );
}

function HeadForm({ action, currentId, candidates, preferDepartment }: { action: Action; currentId: number | null; candidates: Candidate[]; preferDepartment?: string }) {
  const { state, onSubmit, pending } = useFormAction(action);
  const inDept = preferDepartment ? candidates.filter((c) => c.department.name === preferDepartment) : [];
  const others = candidates.filter((c) => !inDept.includes(c));
  const toOption = (c: Candidate, group: string): SelectOption => ({
    value: String(c.id),
    label: c.name,
    hint: c.department.name !== preferDepartment ? `${c.staffNo} · ${c.department.name}` : `${c.staffNo} · ${DESIGNATION_LABELS[c.designation as keyof typeof DESIGNATION_LABELS]}`,
    group,
  });
  const options: SelectOption[] = [
    { value: "", label: "No one (leave empty)" },
    ...inDept.map((c) => toOption(c, `In ${preferDepartment}`)),
    ...others.map((c) => toOption(c, inDept.length ? "Other departments" : "Managers and executives")),
  ];
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <FormMessage state={state} />
      <Field label="Staff member" name="staffId" state={state} hint="Active managers and executives. Search by name, staff no. or department.">
        <Select {...fieldProps("staffId", state)} defaultValue={currentId ? String(currentId) : ""} options={options} placeholder="No one (leave empty)" />
      </Field>
      <DialogFooter pending={pending} submit="Save" ok={state.status === "ok"} />
    </form>
  );
}

// ---------- Delete confirmations ----------

export function ConfirmDialog({
  label,
  title,
  description,
  action,
  confirm,
  size,
  variant = "danger",
}: {
  label: string;
  title: string;
  description: React.ReactNode;
  action: (prev: ActionState) => Promise<ActionState>;
  confirm: string;
  size?: "sm";
  variant?: "ghost" | "secondary" | "danger" | "danger-ghost";
}) {
  // Deletes look the same everywhere: solid red with a bin, like Delete on a training.
  const content =
    variant === "danger" ? (
      <>
        <Trash2 size={size === "sm" ? 13 : 14} aria-hidden /> {label}
      </>
    ) : (
      label
    );
  return (
    <DialogButton label={content} title={title} size={size} variant={variant}>
      <ConfirmForm action={action} confirm={confirm} description={description} />
    </DialogButton>
  );
}

function ConfirmForm({ action, confirm, description }: { action: (prev: ActionState) => Promise<ActionState>; confirm: string; description: React.ReactNode }) {
  const { state, onSubmit, pending } = useFormAction(action);
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <FormMessage state={state} />
      {state.status !== "ok" && <div className="text-[13px] text-ink-2">{description}</div>}
      <DialogFooter pending={pending} submit={confirm} variant="danger" ok={state.status === "ok"} />
    </form>
  );
}

// ---------- Sections ----------

export function AddSectionForm({ action }: { action: Action }) {
  const { state, onSubmit, pending } = useFormAction(action);
  const form = useRef<HTMLFormElement>(null);
  // Clear the name only once it has been saved.
  useEffect(() => {
    if (state.status === "ok") form.current?.reset();
  }, [state]);
  return (
    <form ref={form} onSubmit={onSubmit} noValidate className="flex flex-col gap-1">
      <div className="flex gap-2">
        <label htmlFor="new-section" className="sr-only">
          New section name
        </label>
        <input id="new-section" name="name" className="input h-[26px] max-w-[260px] text-[13px]" placeholder="New section name" maxLength={120} aria-invalid={state.status === "error" || undefined} />
        <SubmitButton variant="secondary" pending={pending} pendingLabel="Adding…" className="btn-sm">
          Add section
        </SubmitButton>
      </div>
      {state.status === "error" && <div className="field-error">{state.fieldErrors?.name?.join(". ") ?? state.message}</div>}
    </form>
  );
}

// ---------- Staff transfer ----------

type StaffRow = { id: number; staffNo: string; name: string; position: string | null; designation: string; sectionId: number | null };
type DeptOption = { id: number; name: string; division: { name: string }; sections: { id: number; name: string }[] };

export function StaffTransferTable({
  staff,
  sections,
  hodId,
  departments,
  currentDepartmentId,
  action,
}: {
  staff: StaffRow[];
  sections: { id: number; name: string }[];
  hodId: number | null;
  departments: DeptOption[];
  currentDepartmentId: number;
  action: Action;
}) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const transferred = useRef(false);
  const sectionName = new Map(sections.map((s) => [s.id, s.name]));
  const allChecked = staff.length > 0 && selected.size === staff.length;
  const toggle = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div>
      <div className="flex min-h-11 flex-wrap items-center gap-3 border-b border-rule px-5 py-2">
        <span className="text-[13px] text-ink-2">{selected.size ? `${selected.size} selected` : "Tick staff, then choose Transfer to move them to another department or section."}</span>
        {/* Stays mounted after a transfer so its result is shown; the selection clears when it closes. */}
        <DialogButton
          label={`Transfer ${selected.size}`}
          title={`Transfer ${selected.size} staff`}
          size="sm"
          variant="primary"
          width={480}
          hideTrigger={selected.size === 0}
          onClose={() => {
            if (transferred.current) setSelected(new Set());
            transferred.current = false;
          }}
        >
          <TransferForm
            ids={[...selected]}
            hodSelected={hodId !== null && selected.has(hodId)}
            departments={departments}
            currentDepartmentId={currentDepartmentId}
            action={action}
            onDone={() => {
              transferred.current = true;
            }}
          />
        </DialogButton>
        {selected.size > 0 && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSelected(new Set())}>
            Clear selection
          </button>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th className="w-9 pl-5">
                <input
                  type="checkbox"
                  aria-label="Select all"
                  checked={allChecked}
                  onChange={() => setSelected(allChecked ? new Set() : new Set(staff.map((s) => s.id)))}
                  className="accent-primary"
                />
              </th>
              <th className="w-px text-right whitespace-nowrap">No.</th>
              <th className="w-24">Staff no.</th>
              <th>Name</th>
              <th className="hidden sm:table-cell">Section</th>
              <th className="hidden w-32 md:table-cell">Designation</th>
            </tr>
          </thead>
          <tbody>
            {staff.map((s, i) => (
              <tr key={s.id} className={selected.has(s.id) ? "[&>td]:bg-accent-soft" : ""}>
                <td className="pl-5">
                  <input type="checkbox" aria-label={`Select ${s.name}`} checked={selected.has(s.id)} onChange={() => toggle(s.id)} className="accent-primary" />
                </td>
                <td className="num muted text-right">{i + 1}</td>
                <td className="num">{s.staffNo}</td>
                <td>
                  <Link href={`/staff/${s.id}`} className="link">
                    {s.name}
                  </Link>
                  {s.id === hodId && <span className="kbd-tag ml-2">HOD</span>}
                  {s.position && <div className="muted text-xs">{s.position}</div>}
                </td>
                <td className="hidden sm:table-cell">{s.sectionId ? sectionName.get(s.sectionId) : <span className="muted">None</span>}</td>
                <td className="hidden md:table-cell">{DESIGNATION_LABELS[s.designation as keyof typeof DESIGNATION_LABELS]}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {staff.length === 0 && <div className="px-4 py-8 text-center text-[13px] text-ink-2">No active staff in this department.</div>}
      </div>
    </div>
  );
}

function TransferForm({
  ids,
  hodSelected,
  departments,
  currentDepartmentId,
  action,
  onDone,
}: {
  ids: number[];
  hodSelected: boolean;
  departments: DeptOption[];
  currentDepartmentId: number;
  action: Action;
  onDone: () => void;
}) {
  const { state, onSubmit, pending } = useFormAction(async (prev, fd) => {
    const result = await action(prev, fd);
    if (result.status === "ok") onDone();
    return result;
  });
  const [departmentId, setDepartmentId] = useState<number>(currentDepartmentId);
  const sections = departments.find((d) => d.id === departmentId)?.sections ?? [];

  if (state.status === "ok")
    return (
      <div className="flex flex-col gap-4">
        <FormMessage state={state} />
        <div className="flex justify-end">
          <CancelButton label="Close" />
        </div>
      </div>
    );

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {ids.map((id) => (
        <input key={id} type="hidden" name="staffIds" value={id} />
      ))}
      <FormMessage state={state} />
      {hodSelected && <div className="notice notice-wait">The HOD is selected. If they move to another department, this department will have no HOD until you choose one.</div>}
      <Field label="To department" name="departmentId" required state={state}>
        <Select
          {...fieldProps("departmentId", state)}
          value={String(departmentId)}
          onChange={(v) => setDepartmentId(Number(v))}
          options={departments.map((d) => ({
            value: String(d.id),
            label: d.name,
            hint: d.id === currentDepartmentId ? "current" : undefined,
            group: d.division.name,
          }))}
        />
      </Field>
      <Field label="Section" name="sectionId" state={state} hint={sections.length ? undefined : "This department has no sections."}>
        <Select
          key={departmentId}
          {...fieldProps("sectionId", state)}
          defaultValue=""
          placeholder="None"
          disabled={!sections.length}
          options={[{ value: "", label: "None" }, ...sections.map((s) => ({ value: String(s.id), label: s.name }))]}
        />
      </Field>
      <DialogFooter pending={pending} submit="Transfer" ok={false} />
    </form>
  );
}
