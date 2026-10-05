"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { Status } from "@/components/ui/Status";
import { withBasePath } from "@/lib/base-path";
import { plural } from "@/lib/format";
import type { OjtImportPreview, OjtImportResultRow } from "@/server/services/ojtImport";
import { commitOjtImportAction, previewOjtImportAction } from "../actions";

type Step = { kind: "choose" } | { kind: "preview"; preview: OjtImportPreview } | { kind: "done"; ojt: number; people: number };

const STEPS = ["Choose file", "Check rows", "Import"];

/** `done` is where the finished import points: the OJT list, or Trainings for L&D. */
export function OjtImportFlow({ contractOnly, done }: { contractOnly: boolean; done: { href: string; label: string } }) {
  const [step, setStep] = useState<Step>({ kind: "choose" });
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [onlyErrors, setOnlyErrors] = useState(false);
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  const current = step.kind === "choose" ? 0 : step.kind === "preview" ? 1 : 2;

  function check() {
    if (!file) return setError("Choose an Excel file first.");
    const fd = new FormData();
    fd.set("file", file);
    setError(null);
    start(async () => {
      const r = await previewOjtImportAction(fd);
      if (r.ok) {
        setStep({ kind: "preview", preview: r.data });
        setOnlyErrors(r.data.counts.error > 0);
      } else setError(r.message);
    });
  }

  function commit() {
    if (!file) return;
    const fd = new FormData();
    fd.set("file", file);
    setError(null);
    start(async () => {
      const r = await commitOjtImportAction(fd);
      if (r.ok) setStep({ kind: "done", ...r.data });
      else setError(r.message);
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
          <li
            key={label}
            aria-current={i === current ? "step" : undefined}
            className={i === current ? "font-medium text-ink" : i < current ? "text-ink-2" : "text-ink-3"}
          >
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
        <div className="flex max-w-[720px] flex-col gap-4">
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
              The &quot;OJT Import&quot; sheet of the template, headings in row 1.{" "}
              <a href={withBasePath("/ojt/import/template")} className="link" download>
                Download the template
              </a>
              , which explains how to fill it in.
            </p>
          </div>
          <ul className="list-disc pl-5 text-[13px] text-ink-2">
            <li>One row per participant. Rows with the same title, venue, dates, times and trainer become one OJT.</li>
            <li>
              With all three answers filled in, that person is recorded as completed. Left blank, they give their answers on My training. An OJT of 4 hours or
              less is completed for everyone.
            </li>
            <li>Nothing is saved until you have checked the rows, and nothing is imported while any row has a problem.</li>
            {contractOnly && <li>You can import OJT for contract staff only. Rows for other staff are rejected.</li>}
          </ul>
          <div>
            <button type="button" className="btn btn-primary" onClick={check} disabled={pending || !file}>
              {pending ? "Checking…" : "Check file"}
            </button>
          </div>
        </div>
      )}

      {step.kind === "preview" && (
        <Preview preview={step.preview} onlyErrors={onlyErrors} setOnlyErrors={setOnlyErrors} pending={pending} onCommit={commit} onRestart={restart} />
      )}

      {step.kind === "done" && (
        <div className="flex max-w-[640px] flex-col gap-4">
          <div role="status" className="notice notice-ok">
            Import finished: {plural(step.ojt, "OJT", "OJT")} for {plural(step.people, "staff record")}.
          </div>
          <div className="flex gap-2">
            <Link href={done.href} className="btn btn-primary">
              {done.label}
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
  onlyErrors,
  setOnlyErrors,
  pending,
  onCommit,
  onRestart,
}: {
  preview: OjtImportPreview;
  onlyErrors: boolean;
  setOnlyErrors: (v: boolean) => void;
  pending: boolean;
  onCommit: () => void;
  onRestart: () => void;
}) {
  const { counts } = preview;
  const rows = onlyErrors ? preview.rows.filter((r) => r.result === "error") : preview.rows;
  const people = counts.completed + counts.pending;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 text-[13px]">
        <span className="font-medium">{preview.fileName}</span>
        <span className="num">{plural(preview.rows.length, "row")}</span>
        <span>
          <span className="num">{counts.ojt}</span> OJT
        </span>
        <span>
          <span className="num">{counts.completed}</span> completed
        </span>
        <span>
          <span className="num">{counts.pending}</span> answers due
        </span>
        <span className={counts.error ? "text-bad" : "text-ink-3"}>
          <span className="num">{counts.error}</span> with problems
        </span>
      </div>

      {counts.error > 0 && (
        <>
          <div role="alert" className="notice notice-bad">
            {plural(counts.error, "row")} {counts.error === 1 ? "has" : "have"} problems. Nothing can be imported until every row is right: fix them in Excel,
            save, and choose the file again.
          </div>
          <label className="flex items-center gap-2 text-[13px]">
            <input type="checkbox" checked={onlyErrors} onChange={(e) => setOnlyErrors(e.target.checked)} className="accent-primary" />
            Show only rows with problems
          </label>
        </>
      )}

      <div className="max-h-[calc(60vh/var(--app-zoom))] overflow-auto rounded-md border border-rule bg-surface">
        <table className="table min-w-[760px]" aria-label="Rows in the file">
          <thead>
            <tr>
              <th className="w-px text-right whitespace-nowrap">No.</th>
              <th className="w-px whitespace-nowrap" title="The row in your Excel file">
                Excel row
              </th>
              <th className="w-px whitespace-nowrap">Staff no.</th>
              <th>Name</th>
              <th>OJT</th>
              <th className="w-px whitespace-nowrap">Dates</th>
              <th className="w-[34%]">Result</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.row}>
                <td className="num muted text-right">{i + 1}</td>
                <td className="num muted">{r.row}</td>
                <td className="num whitespace-nowrap">{r.staffNo}</td>
                <td>{r.name || <span className="muted">–</span>}</td>
                <td>
                  {r.title}
                  {r.ojt && <div className="muted text-xs">OJT {r.ojt} in this file</div>}
                </td>
                <td className="num whitespace-nowrap">{r.dates}</td>
                <td>
                  <RowResult row={r} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap gap-2 border-t border-rule pt-4">
        <button type="button" className="btn btn-primary" onClick={onCommit} disabled={pending || counts.error > 0 || people === 0}>
          {pending
            ? "Importing…"
            : counts.error > 0
              ? "Fix the rows with problems first"
              : `Import ${plural(counts.ojt, "OJT", "OJT")} for ${plural(people, "staff record")}`}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onRestart} disabled={pending}>
          Choose a different file
        </button>
      </div>
    </div>
  );
}

function RowResult({ row }: { row: OjtImportResultRow }) {
  if (row.result === "COMPLETED") return <Status tone="ok">Completed</Status>;
  if (row.result === "PENDING") return <Status tone="wait">Answers due</Status>;
  return (
    <div>
      <Status tone="bad">Problem</Status>
      <ul className="mt-0.5 text-xs text-bad">
        {row.errors.map((e) => (
          <li key={e}>{e}</li>
        ))}
      </ul>
    </div>
  );
}
