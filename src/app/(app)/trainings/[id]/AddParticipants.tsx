"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, UserPlus } from "lucide-react";
import { CancelButton, DialogButton } from "@/components/ui/Dialog";
import { FormMessage, SubmitButton, useFormAction } from "@/components/ui/forms";
import { Select } from "@/components/ui/Select";
import { plural } from "@/lib/format";
import { DESIGNATION_LABELS } from "@/lib/validation/staff";
import { addParticipantsAction, participantCandidatesAction } from "./participantActions";

type Candidates = Awaited<ReturnType<typeof participantCandidatesAction>>;

/** Rows drawn at once; searching or filtering narrows the rest. "Select all" still covers every match. */
const RENDER_LIMIT = 300;

export function AddParticipantsDialog({ trainingId }: { trainingId: number }) {
  return (
    <DialogButton
      label={
        <>
          <UserPlus size={14} aria-hidden /> Add participants
        </>
      }
      variant="primary"
      size="sm"
      title="Add participants"
      description="Pick staff by name, or narrow to a department or section and select everyone in it. Resigned staff aren't listed."
      width={640}
    >
      <AddForm trainingId={trainingId} />
    </DialogButton>
  );
}

function AddForm({ trainingId }: { trainingId: number }) {
  const [data, setData] = useState<Candidates | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [departmentId, setDepartmentId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const { state, onSubmit, pending } = useFormAction(addParticipantsAction.bind(null, trainingId));

  useEffect(() => {
    let live = true;
    participantCandidatesAction(trainingId)
      .then((d) => live && setData(d))
      .catch(() => live && setLoadError(true));
    return () => {
      live = false;
    };
  }, [trainingId]);

  const sections = data?.departments.find((d) => String(d.id) === departmentId)?.sections ?? [];
  const matches = useMemo(() => {
    if (!data) return [];
    const needle = q.trim().toLowerCase();
    return data.staff.filter(
      (s) =>
        (!departmentId || String(s.departmentId) === departmentId) &&
        (!sectionId || String(s.sectionId) === sectionId) &&
        (!needle || `${s.name} ${s.staffNo}`.toLowerCase().includes(needle)),
    );
  }, [data, departmentId, sectionId, q]);
  const pickable = matches.filter((s) => !s.added);
  const allShownChecked = pickable.length > 0 && pickable.every((s) => selected.has(s.id));

  const toggle = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleShown = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const s of pickable) {
        if (allShownChecked) next.delete(s.id);
        else next.add(s.id);
      }
      return next;
    });

  if (state.status === "ok")
    return (
      <div className="flex flex-col gap-4">
        <FormMessage state={state} />
        <div className="flex justify-end">
          <CancelButton label="Close" />
        </div>
      </div>
    );

  if (loadError)
    return (
      <div className="flex flex-col gap-4">
        <div className="notice notice-bad">The staff list couldn&apos;t be loaded. Close this and try again.</div>
        <div className="flex justify-end">
          <CancelButton label="Close" />
        </div>
      </div>
    );

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      {[...selected].map((id) => (
        <input key={id} type="hidden" name="staffIds" value={id} />
      ))}
      <FormMessage state={state} />

      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <label htmlFor="add-department" className="label">
            Department
          </label>
          <Select
            id="add-department"
            name="department"
            value={departmentId}
            onChange={(v) => {
              setDepartmentId(v);
              setSectionId("");
            }}
            disabled={!data}
            options={[
              { value: "", label: "All departments" },
              ...(data?.departments ?? []).map((d) => ({ value: String(d.id), label: d.name, group: d.division })),
            ]}
          />
        </div>
        <div>
          <label htmlFor="add-section" className="label">
            Section
          </label>
          <Select
            key={departmentId}
            id="add-section"
            name="section"
            value={sectionId}
            onChange={setSectionId}
            disabled={!sections.length}
            placeholder={departmentId ? "No sections" : "Choose a department first"}
            options={sections.length ? [{ value: "", label: "All sections" }, ...sections.map((s) => ({ value: String(s.id), label: s.name }))] : []}
          />
        </div>
      </div>
      <label className="relative">
        <span className="sr-only">Search staff</span>
        <Search size={14} aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-ink-3" />
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or staff no." className="input pl-8" disabled={!data} />
      </label>

      <div className="rounded-md border border-rule">
        <div className="flex min-h-10 items-center gap-3 border-b border-rule bg-sunken px-3 py-1.5 text-[13px]">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={allShownChecked} onChange={toggleShown} disabled={!pickable.length} className="accent-primary" />
            Select all{data && <span className="num text-ink-3">({pickable.length})</span>}
          </label>
          <span className="ml-auto text-ink-2">
            {selected.size ? (
              <>
                <span className="num font-semibold text-ink">{selected.size}</span> selected
                <button type="button" className="btn btn-ghost btn-sm ml-2" onClick={() => setSelected(new Set())}>
                  Clear
                </button>
              </>
            ) : (
              "None selected"
            )}
          </span>
        </div>
        <ul aria-label="Staff" className="max-h-[min(340px,45dvh)] overflow-y-auto">
          {!data && (
            <li aria-busy="true" className="flex flex-col gap-3 px-3 py-3">
              <span className="sr-only">Loading staff</span>
              {[0, 1, 2, 3].map((i) => (
                <span key={i} aria-hidden className="flex items-center gap-2.5">
                  <span className="skeleton size-4 rounded" />
                  <span className="flex flex-1 flex-col gap-1.5">
                    <span className="skeleton h-3 w-2/5" />
                    <span className="skeleton h-2.5 w-1/4" />
                  </span>
                </span>
              ))}
            </li>
          )}
          {data && matches.length === 0 && <li className="px-3 py-6 text-center text-[13px] text-ink-3">No active staff match.</li>}
          {matches.slice(0, RENDER_LIMIT).map((s) => (
            <li key={s.id} className="border-b border-rule last:border-b-0">
              <label className={`flex items-start gap-2.5 px-3 py-1.5 text-[13px] ${s.added ? "text-ink-3" : "cursor-pointer hover:bg-sunken"}`}>
                <input
                  type="checkbox"
                  checked={s.added || selected.has(s.id)}
                  disabled={s.added}
                  onChange={() => toggle(s.id)}
                  aria-label={`${s.name} (${s.staffNo})`}
                  className="mt-0.5 accent-primary"
                />
                <span className="min-w-0 flex-1">
                  <span className={s.added ? "" : "font-medium"}>{s.name}</span>
                  <span className="block text-xs text-ink-3">
                    {s.departmentName} · {DESIGNATION_LABELS[s.designation]}
                  </span>
                </span>
                <span className="num shrink-0 text-xs text-ink-3">{s.added ? "Already added" : s.staffNo}</span>
              </label>
            </li>
          ))}
          {matches.length > RENDER_LIMIT && (
            <li className="px-3 py-2 text-center text-xs text-ink-3">
              Showing {RENDER_LIMIT} of {matches.length}. Search or pick a department to narrow the list; Select all includes every match.
            </li>
          )}
        </ul>
      </div>

      <div className="flex justify-end gap-2 border-t border-rule pt-4">
        <CancelButton />
        <SubmitButton pending={pending} pendingLabel="Adding…" disabled={selected.size === 0}>
          {selected.size ? `Add ${plural(selected.size, "participant")}` : "Add participants"}
        </SubmitButton>
      </div>
    </form>
  );
}
