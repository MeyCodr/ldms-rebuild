"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Download, Eye, FileText, Trash2, Upload } from "lucide-react";
import { removeCertificateAction, uploadCertificateAction } from "@/app/(app)/certificates/actions";
import { Panel } from "@/components/Panel";
import { CancelButton, Dialog, useCloseDialog } from "@/components/ui/Dialog";
import { FormMessage, SubmitButton, useFormAction } from "@/components/ui/forms";
import type { ActionState } from "@/lib/action-state";
import { withBasePath } from "@/lib/base-path";
import { formatDateTime } from "@/lib/format";
import { CERTIFICATE_MAX_BYTES } from "@/server/rules/certificate";
import type { CertificateInfo } from "@/server/services/certificate";

type CertificateFile = NonNullable<CertificateInfo["file"]>;

/**
 * A training's certificate: one file for the whole class. The file opens in
 * a preview, which is where it is downloaded, replaced or deleted, by those
 * who may (see certificateInfo). Without one, those who may upload get the
 * form. Used on the training page (`wide`: a full-width row) and in the side
 * column of the OJT record and My training.
 */
export function CertificatePanel({
  info,
  className,
  emptyText = "No certificate has been uploaded yet.",
  lockedText,
  wide = false,
}: {
  info: CertificateInfo;
  className?: string;
  wide?: boolean;
  /** Shown when there's no certificate and the user can't upload one. */
  emptyText?: string;
  /** Shown when there is one the user can't open yet. */
  lockedText?: string;
}) {
  const { trainingId, file, canDownload, manageBlock, uploadBlock } = info;
  const [previewing, setPreviewing] = useState(false);
  // Says what just happened when the certificate changes. Worked out from the
  // file itself, since a first upload's form is gone by the time it succeeds.
  const current = file ? `${file.name}|${String(file.at)}` : null;
  const [shown, setShown] = useState(current);
  const [notice, setNotice] = useState<string | null>(null);
  if (current !== shown) {
    setShown(current);
    setNotice(!shown ? "Certificate uploaded." : !current ? "Certificate deleted." : "Certificate replaced.");
  }

  const view = file && canDownload && (
    <button type="button" className="btn btn-sm" onClick={() => setPreviewing(true)}>
      <Eye size={14} aria-hidden /> View certificate
    </button>
  );

  return (
    <Panel
      className={className}
      title="Certificate"
      description={wide ? "One file for everyone on the training, as the trainer or provider sends it." : undefined}
      // Wide: the button sits in the header from tablet width, under the file on phones.
      action={wide && view ? <div className="hidden md:block">{view}</div> : undefined}
    >
      <div className="flex flex-col gap-3">
        {notice && (
          <div role="status" className="notice notice-ok">
            {notice}
          </div>
        )}
        {file ? (
          <>
            {canDownload ? (
              <button
                type="button"
                onClick={() => setPreviewing(true)}
                className="group flex w-full items-start gap-3 rounded-lg bg-sunken px-3.5 py-3 text-left hover:bg-accent-soft"
                aria-label={`View the certificate, ${file.name}`}
              >
                <FileSummary file={file} />
              </button>
            ) : (
              <div className="flex items-start gap-3 rounded-lg bg-sunken px-3.5 py-3">
                <FileSummary file={file} />
              </div>
            )}
            {!canDownload && lockedText && <p className="text-[13px] text-ink-2">{lockedText}</p>}
            {view && <div className={wide ? "md:hidden" : undefined}>{view}</div>}
            {canDownload && (
              <Dialog open={previewing} onClose={() => setPreviewing(false)} title="Certificate" width={1040}>
                <Preview trainingId={trainingId} file={file} canReplace={!uploadBlock} canDelete={!manageBlock} />
              </Dialog>
            )}
          </>
        ) : !uploadBlock ? (
          <UploadForm trainingId={trainingId} submitLabel="Upload certificate" wide={wide} />
        ) : (
          <p className="text-[13px] text-ink-2">{manageBlock ? emptyText : uploadBlock}</p>
        )}
      </div>
    </Panel>
  );
}

function FileSummary({ file }: { file: CertificateFile }) {
  return (
    <>
      <FileText size={18} aria-hidden className="mt-0.5 shrink-0 text-ink-3 group-hover:text-accent" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px] font-medium" title={file.name} data-testid="certificate-name">
          {file.name}
        </span>
        <span className="block text-xs text-ink-3">
          Uploaded {file.at && <span className="num">{formatDateTime(file.at)}</span>}
          {file.by && <> by {file.by}</>}
        </span>
      </span>
    </>
  );
}

/**
 * The certificate itself, fetched through the download route (so the same
 * check applies) and shown from memory: a PDF in the browser's viewer, an
 * image as it is. Below it, what the user may do with it.
 */
function Preview({ trainingId, file, canReplace, canDelete }: { trainingId: number; file: CertificateFile; canReplace: boolean; canDelete: boolean }) {
  const href = withBasePath(`/certificates/${trainingId}`);
  const [mode, setMode] = useState<"view" | "replace" | "delete">("view");
  const [loaded, setLoaded] = useState<{ url: string; type: string } | "failed" | null>(null);

  useEffect(() => {
    let live = true;
    let url: string | null = null;
    fetch(href, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const blob = await r.blob();
        if (!live) return;
        url = URL.createObjectURL(blob);
        setLoaded({ url, type: blob.type });
      })
      .catch(() => live && setLoaded("failed"));
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [href]);

  const pdf = loaded && loaded !== "failed" && loaded.type === "application/pdf";

  return (
    <div className="flex flex-col gap-4">
      <div className="text-[13px]">
        <div className="font-medium break-words text-ink">{file.name}</div>
        <div className="text-xs text-ink-3">
          Uploaded {file.at && <span className="num">{formatDateTime(file.at)}</span>}
          {file.by && <> by {file.by}</>}
        </div>
      </div>

      <div
        className="flex h-[calc(62dvh/var(--app-zoom))] min-h-64 items-center justify-center overflow-hidden rounded-lg border border-rule bg-sunken"
        data-testid="certificate-preview"
      >
        {loaded === null ? (
          <p className="text-[13px] text-ink-3">Loading the certificate…</p>
        ) : loaded === "failed" ? (
          <p className="px-6 text-center text-[13px] text-ink-2">The preview couldn&apos;t be loaded. Download the certificate to open it.</p>
        ) : pdf ? (
          // Opened fitted to the width, so the whole page shows at once.
          <iframe src={`${loaded.url}#view=FitH`} title={`Preview of ${file.name}`} className="h-full w-full bg-surface" />
        ) : (
          // A blob: URL from the fetch above, which next/image can't load.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={loaded.url} alt={`Certificate: ${file.name}`} className="max-h-full max-w-full object-contain" />
        )}
      </div>
      {pdf && <p className="-mt-2 text-xs text-ink-3 md:hidden">Some phones can&apos;t show a PDF here. Use Download to open it.</p>}

      {mode === "view" && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-rule pt-4">
          <div>
            {canDelete && (
              <button type="button" className="btn btn-danger" onClick={() => setMode("delete")}>
                <Trash2 size={14} aria-hidden /> Delete
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <CancelButton label="Close" />
            {canReplace && (
              <button type="button" className="btn" onClick={() => setMode("replace")}>
                <Upload size={14} aria-hidden /> Replace
              </button>
            )}
            <a href={href} className="btn btn-primary" download>
              <Download size={14} aria-hidden /> Download
            </a>
          </div>
        </div>
      )}
      {mode === "replace" && (
        <div className="border-t border-rule pt-4">
          <p className="mb-3 text-[13px] text-ink-2">The new file takes the place of this one, for everyone on the training.</p>
          <UploadForm trainingId={trainingId} submitLabel="Replace certificate" onCancel={() => setMode("view")} />
        </div>
      )}
      {mode === "delete" && <DeleteForm trainingId={trainingId} fileName={file.name} onCancel={() => setMode("view")} />}
    </div>
  );
}

/** Closes the dialog the form is in (if any) once it succeeds. */
function useCloseOnSuccess(state: ActionState) {
  const close = useCloseDialog();
  useEffect(() => {
    if (state.status === "ok") close();
  }, [state, close]);
}

function UploadForm({
  trainingId,
  submitLabel,
  onCancel,
  wide = false,
}: {
  trainingId: number;
  submitLabel: string;
  /** Shows a Cancel button that calls this. */
  onCancel?: () => void;
  /** The file field and the button side by side, from tablet width. */
  wide?: boolean;
}) {
  const { state, onSubmit, pending } = useFormAction(uploadCertificateAction.bind(null, trainingId));
  const [tooBig, setTooBig] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const id = useId();
  useCloseOnSuccess(state);

  return (
    <form
      noValidate
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        // Checked here too, so a large file isn't sent only to be refused.
        const f = input.current?.files?.[0];
        if (f && f.size > CERTIFICATE_MAX_BYTES) {
          e.preventDefault();
          return setTooBig("The file is larger than 5 MB. Save a smaller copy (a scan at a lower resolution, say) and try again.");
        }
        setTooBig(null);
        onSubmit(e);
      }}
    >
      {tooBig ? (
        <div role="alert" className="notice notice-bad">
          {tooBig}
        </div>
      ) : (
        state.status === "error" && <FormMessage state={state} />
      )}
      <div className={wide ? "flex flex-col gap-3 md:flex-row md:items-end md:justify-between md:gap-6" : "flex flex-col gap-3"}>
        <div className="min-w-0">
          <label htmlFor={id} className="label">
            Certificate file
          </label>
          <input
            ref={input}
            id={id}
            name="certificate"
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
            className="block w-full text-[13px] file:mr-3 file:h-8 file:cursor-pointer file:rounded file:border file:border-rule-strong file:bg-surface file:px-3 file:text-[13px] file:font-medium hover:file:bg-sunken"
          />
          <p className="hint mt-1.5">PDF, JPG or PNG, up to 5 MB.{wide ? "" : " One file for everyone on the training."}</p>
        </div>
        <div className="flex shrink-0 justify-end gap-2">
          {onCancel && (
            <button type="button" className="btn" onClick={onCancel} disabled={pending}>
              Cancel
            </button>
          )}
          <SubmitButton pending={pending} pendingLabel="Uploading…">
            <Upload size={14} aria-hidden /> {submitLabel}
          </SubmitButton>
        </div>
      </div>
    </form>
  );
}

function DeleteForm({ trainingId, fileName, onCancel }: { trainingId: number; fileName: string; onCancel: () => void }) {
  const { state, onSubmit, pending } = useFormAction(removeCertificateAction.bind(null, trainingId));
  useCloseOnSuccess(state);
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3 border-t border-rule pt-4">
      {state.status === "error" && <FormMessage state={state} />}
      <p className="text-[13px] text-ink-2">
        Delete <span className="font-medium text-ink">{fileName}</span>? It is removed for everyone on this training. This can&apos;t be undone; the deletion
        stays in the audit log.
      </p>
      <div className="flex justify-end gap-2">
        <button type="button" className="btn" onClick={onCancel} disabled={pending}>
          Cancel
        </button>
        <SubmitButton variant="danger" pending={pending} pendingLabel="Deleting…">
          <Trash2 size={14} aria-hidden /> Delete certificate
        </SubmitButton>
      </div>
    </form>
  );
}
