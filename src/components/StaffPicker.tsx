"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Select } from "@/components/ui/Select";
import { DESIGNATION_LABELS } from "@/lib/validation/staff";

export type PickerStaff = {
  id: number;
  staffNo: string;
  name: string;
  designation: keyof typeof DESIGNATION_LABELS;
  departmentId: number;
  sectionId: number | null;
  departmentName: string;
  /** Shown instead of the staff no. when this person can't be picked, e.g. "Already added". */
  unavailable?: string;
};

export type PickerDepartment = { id: number; name: string; division: string; sections: { id: number; name: string }[] };

/** Rows drawn at once; searching or filtering narrows the rest. "Select all" still covers every match. */
const RENDER_LIMIT = 300;

/**
 * Pick staff by name or staff no., or narrow to a department or section and
 * select everyone in it. Used to add participants to a training and to record
 * an OJT for several staff. `staff` is null while it loads.
 */
export function StaffPicker({
  staff,
  departments,
  selected,
  onChange,
  idPrefix,
  emptyText = "No active staff match.",
}: {
  staff: PickerStaff[] | null;
  departments: PickerDepartment[];
  selected: Set<number>;
  onChange: (next: Set<number>) => void;
  /** Keeps the filter fields' ids unique on the page. */
  idPrefix: string;
  emptyText?: string;
}) {
  const [departmentId, setDepartmentId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [q, setQ] = useState("");

  const sections = departments.find((d) => String(d.id) === departmentId)?.sections ?? [];
  const matches = useMemo(() => {
    if (!staff) return [];
    const needle = q.trim().toLowerCase();
    return staff.filter(
      (s) =>
        (!departmentId || String(s.departmentId) === departmentId) &&
        (!sectionId || String(s.sectionId) === sectionId) &&
        (!needle || `${s.name} ${s.staffNo}`.toLowerCase().includes(needle)),
    );
  }, [staff, departmentId, sectionId, q]);
  const pickable = matches.filter((s) => !s.unavailable);
  const allShownChecked = pickable.length > 0 && pickable.every((s) => selected.has(s.id));

  const toggle = (id: number) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  };
  const toggleShown = () => {
    const next = new Set(selected);
    for (const s of pickable) {
      if (allShownChecked) next.delete(s.id);
      else next.add(s.id);
    }
    onChange(next);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <label htmlFor={`${idPrefix}-department`} className="label">
            Department
          </label>
          <Select
            id={`${idPrefix}-department`}
            name="department"
            value={departmentId}
            onChange={(v) => {
              setDepartmentId(v);
              setSectionId("");
            }}
            disabled={!staff}
            options={[{ value: "", label: "All departments" }, ...departments.map((d) => ({ value: String(d.id), label: d.name, group: d.division }))]}
          />
        </div>
        <div>
          <label htmlFor={`${idPrefix}-section`} className="label">
            Section
          </label>
          <Select
            key={departmentId}
            id={`${idPrefix}-section`}
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
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name or staff no."
          className="input pl-8"
          disabled={!staff}
        />
      </label>

      <div className="rounded-md border border-rule">
        <div className="flex min-h-10 items-center gap-3 border-b border-rule bg-sunken px-3 py-1.5 text-[13px]">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={allShownChecked} onChange={toggleShown} disabled={!pickable.length} className="accent-primary" />
            Select all{staff && <span className="num text-ink-3">({pickable.length})</span>}
          </label>
          <span className="ml-auto text-ink-2">
            {selected.size ? (
              <>
                <span className="num font-semibold text-ink">{selected.size}</span> selected
                <button type="button" className="btn btn-ghost btn-sm ml-2" onClick={() => onChange(new Set())}>
                  Clear
                </button>
              </>
            ) : (
              "None selected"
            )}
          </span>
        </div>
        <ul aria-label="Staff" className="max-h-[min(340px,calc(45dvh/var(--app-zoom)))] overflow-y-auto">
          {!staff && (
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
          {staff && matches.length === 0 && <li className="px-3 py-6 text-center text-[13px] text-ink-3">{emptyText}</li>}
          {matches.slice(0, RENDER_LIMIT).map((s) => (
            <li key={s.id} className="border-b border-rule last:border-b-0">
              <label className={`flex items-start gap-2.5 px-3 py-1.5 text-[13px] ${s.unavailable ? "text-ink-3" : "cursor-pointer hover:bg-sunken"}`}>
                <input
                  type="checkbox"
                  checked={!!s.unavailable || selected.has(s.id)}
                  disabled={!!s.unavailable}
                  onChange={() => toggle(s.id)}
                  aria-label={`${s.name} (${s.staffNo})`}
                  className="mt-0.5 accent-primary"
                />
                <span className="min-w-0 flex-1">
                  <span className={s.unavailable ? "" : "font-medium"}>{s.name}</span>
                  <span className="block text-xs text-ink-3">
                    {s.departmentName} · {DESIGNATION_LABELS[s.designation]}
                  </span>
                </span>
                <span className="num shrink-0 text-xs text-ink-3">{s.unavailable ?? s.staffNo}</span>
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
    </div>
  );
}
