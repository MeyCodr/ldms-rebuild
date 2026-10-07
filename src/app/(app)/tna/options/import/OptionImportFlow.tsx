"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { Status } from "@/components/ui/Status";
import { withBasePath } from "@/lib/base-path";
import type { OptionImportPreview, OptionImportRow } from "@/server/services/tnaOptions";
import { commitOptionImportAction, previewOptionImportAction } from "../actions";

type Step = { kind: "choose" } | { kind: "preview"; preview: OptionImportPreview } | { kind: "done"; created: number; updated: number };

const STEPS = ["Choose file", "Check changes", "Import"];

/** Choose the file, see every change it would make, then confirm. One row with an error stops the whole import. */
export function OptionImportFlow() {
  const [step, setStep] = useState<Step>({ kind: "choose" });
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [onlyChanges, setOnlyChanges] = useState(true);
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  const current = step.kind === "choose" ? 0 : step.kind === "preview" ? 1 : 2;

  function send(commit: boolean) {
    if (!file) return setError("Choose an Excel file first.");
    const fd = new FormData();
    fd.set("file", file);
    setError(null);
    start(async () => {
      if (commit) {
        const r = await commitOptionImportAction(fd);
        if (r.ok) setStep({ kind: "done", ...r.data });
        else setError(r.message);
      } else {
        const r = await previewOptionImportAction(fd);
        if (r.ok) setStep({ kind: "preview", preview: r.data });
        else setError(r.message);
      }
    });
  }

  function restart() {
    setStep({ kind: "choose" });
    setFile(null);
    setError(null);
    if (input.current) input.current.value = "";
  }

  return (
    <div className="flex flex-col gap-5">
      <ol className="flex flex-wrap gap-x-6 gap-y-1 text-[13px]" aria-label="Import steps">
        {STEPS.map((label, i) => (
          <li key={label} aria-current={i === current ? "step" : undefined} className={i === current ? "font-medium text-ink" : i < current ? "text-ink-2" : "text-ink-3"}>
            <span className="num mr-1.5">{i + 1}</span>
            {label}
          </li>
        ))}
      </ol>

      {error && (
        <div role="alert" className="notice notice-bad">
          {error}
        </div>
      )}

      {step.kind === "choose" && (
        <div className="flex max-w-[640px] flex-col gap-4">
          <div className="rounded-md border border-dashed border-rule-strong bg-surface p-5">
            <label htmlFor="file" className="label">
              Excel file (.xlsx)
            </label>
            <input
              ref={input}
              id="file"
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-[13px] file:mr-3 file:h-8 file:cursor-pointer file:rounded file:border file:border-rule-strong file:bg-surface file:px-3 file:text-[13px] file:font-medium hover:file:bg-sunken"
            />
            <p className="hint mt-2">
              Start from{" "}
              <a href={withBasePath("/tna/options/export")} className="link" download>
                the current lists
              </a>
              : columns ID, Section, Group, Training Name, Status. Its second sheet says how to make each kind of change.
            </p>
          </div>
          <ul className="list-disc pl-5 text-[13px] text-ink-2">
            <li>A row with an ID changes that option. A row without one adds an option.</li>
            <li>Options left out of the file stay as they are. To remove one, set its Status to Hidden.</li>
            <li>One row with an error stops the whole import, so the lists are never half changed.</li>
          </ul>
          <div>
            <button type="button" className="btn btn-primary" onClick={() => send(false)} disabled={pending || !file}>
              {pending ? "Checking…" : "Check file"}
            </button>
          </div>
        </div>
      )}

      {step.kind === "preview" && <Preview preview={step.preview} onlyChanges={onlyChanges} setOnlyChanges={setOnlyChanges} pending={pending} onCommit={() => send(true)} onRestart={restart} />}

      {step.kind === "done" && (
        <div className="flex max-w-[640px] flex-col gap-4">
          <div role="status" className="notice notice-ok">
            Import finished: {step.created} added, {step.updated} changed.
          </div>
          <div className="flex gap-2">
            <Link href="/tna/options" className="btn btn-primary">
              View the lists
            </Link>
            <button type="button" className="btn" onClick={restart}>
              Import another file
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Preview({
  preview,
  onlyChanges,
  setOnlyChanges,
  pending,
  onCommit,
  onRestart,
}: {
  preview: OptionImportPreview;
  onlyChanges: boolean;
  setOnlyChanges: (v: boolean) => void;
  pending: boolean;
  onCommit: () => void;
  onRestart: () => void;
}) {
  const { counts } = preview;
  const toSave = counts.create + counts.update;
  const rows = onlyChanges ? preview.rows.filter((r) => r.action !== "unchanged") : preview.rows;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 text-[13px]">
        <span className="font-medium">{preview.fileName}</span>
        <span className="num">{preview.rows.length} rows</span>
        <span>
          <span className="num">{counts.create}</span> new
        </span>
        <span>
          <span className="num">{counts.update}</span> to change
        </span>
        <span className="text-ink-3">
          <span className="num">{counts.unchanged}</span> unchanged
        </span>
        <span className={counts.error ? "text-bad" : "text-ink-3"}>
          <span className="num">{counts.error}</span> with errors
        </span>
      </div>
      {(preview.newGroups.length > 0 || preview.renamedRows > 0) && (
        <ul className="list-disc pl-5 text-[13px] text-ink-2">
          {preview.newGroups.map((g) => (
            <li key={g}>New group: {g}</li>
          ))}
          {preview.renamedRows > 0 && (
            <li>
              {preview.renamedRows} saved TNA {preview.renamedRows === 1 ? "row takes" : "rows take"} a new training name.
            </li>
          )}
        </ul>
      )}

      <label className="flex items-center gap-2 text-[13px]">
        <input type="checkbox" checked={onlyChanges} onChange={(e) => setOnlyChanges(e.target.checked)} className="accent-primary" />
        Show only rows that change or have errors
      </label>

      <div className="max-h-[calc(60vh/var(--app-zoom))] overflow-auto rounded-md border border-rule bg-surface">
        <table className="table" aria-label="Changes in the file">
          <thead>
            <tr>
              <th className="w-px text-right whitespace-nowrap">No.</th>
              <th className="w-px whitespace-nowrap" title="The row in your Excel file">
                Excel row
              </th>
              <th className="hidden md:table-cell">Section</th>
              <th className="hidden lg:table-cell">Group</th>
              <th>Training name</th>
              <th className="w-[34%]">Result</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.row}>
                <td className="num muted text-right">{i + 1}</td>
                <td className="num muted">{r.row}</td>
                <td className="hidden md:table-cell">{r.section}</td>
                <td className="hidden lg:table-cell">{r.group}</td>
                <td>{r.name}</td>
                <td>
                  <RowResult row={r} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="px-4 py-8 text-center text-[13px] text-ink-3">The file changes nothing.</p>}
      </div>

      <div className="flex flex-col gap-3 border-t border-rule pt-4">
        {counts.error > 0 && (
          <p className="text-[13px] text-bad">
            Fix the {counts.error === 1 ? "row" : `${counts.error} rows`} with errors in Excel, save, and choose the file again. Nothing is imported until every row is right.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-primary" onClick={onCommit} disabled={pending || counts.error > 0 || toSave === 0}>
            {pending ? "Importing…" : toSave === 0 ? "Nothing to import" : `Make ${toSave} ${toSave === 1 ? "change" : "changes"}`}
          </button>
          <button type="button" className="btn btn-ghost" onClick={onRestart} disabled={pending}>
            Choose a different file
          </button>
        </div>
      </div>
    </div>
  );
}

function RowResult({ row }: { row: OptionImportRow }) {
  switch (row.action) {
    case "create":
      return <Status tone="ok">New{row.hidden ? ", hidden" : ""}</Status>;
    case "unchanged":
      return <span className="text-ink-3">No change</span>;
    case "update":
      return <span>Change: {row.changes.join(", ")}</span>;
    case "error":
      return (
        <div>
          <Status tone="bad">Error</Status>
          <ul className="mt-0.5 text-xs text-bad">
            {row.errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      );
  }
}
