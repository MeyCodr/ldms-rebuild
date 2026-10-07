"use client";

import { useId, useState } from "react";
import { Eye, EyeOff, FolderPlus, Pencil, Plus, Trash2 } from "lucide-react";
import { CancelButton, Dialog, DialogButton } from "@/components/ui/Dialog";
import { Status } from "@/components/ui/Status";
import { Field, fieldProps, FormMessage, SubmitButton, useFormAction } from "@/components/ui/forms";
import { Select } from "@/components/ui/Select";
import type { ActionState } from "@/lib/action-state";
import { addGroupAction, addOptionAction, deleteGroupAction, deleteOptionAction, editOptionAction, renameGroupAction, toggleOptionAction } from "./actions";

type Group = { id: number; name: string };

function Done({ state }: { state: ActionState }) {
  return (
    <div className="flex flex-col gap-4">
      <FormMessage state={state} />
      <div className="flex justify-end">
        <CancelButton label="Close" />
      </div>
    </div>
  );
}

/** A dialog's form: the name, and for an option the group it sits in. */
function NameForm({
  action,
  label,
  defaultName = "",
  groups,
  defaultGroup,
  hint,
  submitLabel,
}: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  label: string;
  defaultName?: string;
  /** Given for an option: the section's groups to choose from. */
  groups?: Group[];
  defaultGroup?: number | null;
  hint?: string;
  submitLabel: string;
}) {
  const { state, onSubmit, pending } = useFormAction(action);
  // The page holds several of these dialogs at once, so the fields' ids are this form's own.
  const id = useId();
  if (state.status === "ok") return <Done state={state} />;
  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <FormMessage state={state} />
      <Field label={label} name="name" id={`${id}-name`} required hint={hint ?? "Saved in capitals."} state={state}>
        <input {...fieldProps("name", state, `${id}-name`)} defaultValue={defaultName} className="input" maxLength={255} autoComplete="off" autoFocus />
      </Field>
      {groups && groups.length > 0 && (
        <Field label="Group" name="categoryId" id={`${id}-group`} state={state}>
          <Select
            id={`${id}-group`}
            name="categoryId"
            defaultValue={defaultGroup ? String(defaultGroup) : ""}
            options={[{ value: "", label: "No group" }, ...groups.map((g) => ({ value: String(g.id), label: g.name }))]}
          />
        </Field>
      )}
      <div className="flex justify-end gap-2 border-t border-rule pt-4">
        <CancelButton />
        <SubmitButton pending={pending} pendingLabel="Saving…">
          {submitLabel}
        </SubmitButton>
      </div>
    </form>
  );
}

function Confirm({ action, children, submitLabel }: { action: (prev: ActionState) => Promise<ActionState>; children: React.ReactNode; submitLabel: string }) {
  const { state, onSubmit, pending } = useFormAction(action);
  if (state.status === "ok") return <Done state={state} />;
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <FormMessage state={state} />
      <div className="text-[13px] text-ink-2">{children}</div>
      <div className="flex justify-end gap-2 border-t border-rule pt-4">
        <CancelButton />
        <SubmitButton variant="danger" pending={pending} pendingLabel="Deleting…">
          {submitLabel}
        </SubmitButton>
      </div>
    </form>
  );
}

export function AddOptionDialog({ section, sectionTitle, groups, group }: { section: string; sectionTitle: string; groups: Group[]; group?: number | null }) {
  return (
    <DialogButton
      variant={group === undefined ? "primary" : "ghost"}
      size={group === undefined ? undefined : "sm"}
      label={
        <>
          <Plus size={14} aria-hidden /> Add option
        </>
      }
      title={`Add a training to ${sectionTitle}`}
    >
      <NameForm action={addOptionAction.bind(null, section)} label="Training name" groups={groups} defaultGroup={group ?? null} submitLabel="Add" />
    </DialogButton>
  );
}

export function AddGroupDialog({ section, sectionTitle }: { section: string; sectionTitle: string }) {
  return (
    <DialogButton
      label={
        <>
          <FolderPlus size={14} aria-hidden /> Add group
        </>
      }
      title={`Add a group to ${sectionTitle}`}
      description="A group is a heading inside the list, such as Industrial safety."
    >
      <NameForm action={addGroupAction.bind(null, section)} label="Group name" submitLabel="Add" />
    </DialogButton>
  );
}

/** Hide or show: one click, no dialog. The result shows in the row. */
function ToggleOptionButton({ id, name, active }: { id: number; name: string; active: boolean }) {
  const { state, onSubmit, pending } = useFormAction(toggleOptionAction.bind(null, id));
  return (
    <form onSubmit={onSubmit} className="inline">
      <button type="submit" className="btn btn-ghost btn-sm" disabled={pending} aria-busy={pending} title={active ? "Hide from new rows" : "Show again"}>
        {active ? <EyeOff size={13} aria-hidden /> : <Eye size={13} aria-hidden />} <span className="sr-only sm:not-sr-only">{active ? "Hide" : "Show"}</span>
        <span className="sr-only"> {name}</span>
      </button>
      {state.status === "error" && (
        <span role="alert" className="ml-2 text-xs text-bad">
          {state.message}
        </span>
      )}
    </form>
  );
}

export function RenameGroupDialog({ id, name }: { id: number; name: string }) {
  return (
    <DialogButton
      variant="ghost"
      size="sm"
      label={
        <>
          <Pencil size={13} aria-hidden /> Rename<span className="sr-only"> group {name}</span>
        </>
      }
      title="Rename group"
    >
      <NameForm action={renameGroupAction.bind(null, id)} label="Group name" defaultName={name} submitLabel="Save" />
    </DialogButton>
  );
}

export function DeleteGroupDialog({ id, name }: { id: number; name: string }) {
  return (
    <DialogButton
      variant="danger-ghost"
      size="sm"
      label={
        <>
          <Trash2 size={13} aria-hidden /> Delete group<span className="sr-only"> {name}</span>
        </>
      }
      title="Delete group"
    >
      <Confirm action={deleteGroupAction.bind(null, id)} submitLabel="Delete">
        The empty group <span className="font-medium text-ink">{name}</span> is removed.
      </Confirm>
    </DialogButton>
  );
}

type Option = { id: number; name: string; active: boolean; categoryId: number | null; used: number };

/**
 * A group's options. Edit and Delete open one dialog shared by every row,
 * rather than each row carrying its own: Functional awareness has 140.
 */
export function OptionTable({ label, options, groups }: { label: string; options: Option[]; groups: Group[] }) {
  // The option itself, not its id: the dialog still shows the result after the list has changed under it.
  const [editing, setEditing] = useState<Option | null>(null);
  const [deleting, setDeleting] = useState<Option | null>(null);
  return (
    <>
      <div className="overflow-x-auto">
        <table className="table min-w-[640px]" aria-label={label}>
          <thead>
            <tr>
              <th className="w-px pl-5 text-right whitespace-nowrap">No.</th>
              <th>Training</th>
              <th className="w-px whitespace-nowrap">Status</th>
              <th className="w-px text-right whitespace-nowrap" title="Saved TNA rows that use it">
                Used
              </th>
              <th className="w-px pr-5">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {options.map((o, i) => (
              <tr key={o.id}>
                <td className="num muted pl-5 text-right">{i + 1}</td>
                <td className={o.active ? "" : "text-ink-3"}>{o.name}</td>
                <td className="whitespace-nowrap">{o.active ? <Status tone="ok">Active</Status> : <Status tone="na">Hidden</Status>}</td>
                <td className="num text-right">{o.used || <span className="muted">–</span>}</td>
                <td className="pr-5 text-right whitespace-nowrap">
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(o)}>
                    <Pencil size={13} aria-hidden /> <span className="sr-only sm:not-sr-only">Edit</span>
                    <span className="sr-only"> {o.name}</span>
                  </button>
                  <ToggleOptionButton id={o.id} name={o.name} active={o.active} />
                  {/* An option a saved row uses can be hidden, not deleted. */}
                  {o.used === 0 && (
                    <button type="button" className="btn btn-danger-ghost btn-sm" onClick={() => setDeleting(o)}>
                      <Trash2 size={13} aria-hidden /> <span className="sr-only">Delete {o.name}</span>
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={editing !== null} onClose={() => setEditing(null)} title="Edit training option">
        {editing && (
          <NameForm
            action={editOptionAction.bind(null, editing.id)}
            label="Training name"
            defaultName={editing.name}
            groups={groups}
            defaultGroup={editing.categoryId}
            hint={editing.used ? `Saved in capitals. ${editing.used} saved TNA ${editing.used === 1 ? "row uses" : "rows use"} it and will show the new name.` : undefined}
            submitLabel="Save"
          />
        )}
      </Dialog>
      <Dialog open={deleting !== null} onClose={() => setDeleting(null)} title="Delete training option">
        {deleting && (
          <Confirm action={deleteOptionAction.bind(null, deleting.id)} submitLabel="Delete">
            <span className="font-medium text-ink">{deleting.name}</span> is removed from the list. No saved TNA row uses it.
          </Confirm>
        )}
      </Dialog>
    </>
  );
}
