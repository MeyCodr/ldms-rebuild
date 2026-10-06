// Certificates (module 5): one file per training, as providers send it for
// the whole class. Pure functions: the service enforces them and the pages
// use the same answers to show or hide the buttons.

import type { Attendance, TrainingStatus, TrainingType } from "@prisma/client";
import { can, type SessionUser } from "../permissions";
import { ojtChangeBlock, type OjtPerson } from "./ojt";
import { dayNumber } from "./training";

export const CERTIFICATE_MAX_BYTES = 5 * 1024 * 1024;

export type CertificateKind = "pdf" | "jpg" | "png";

export const CERTIFICATE_MIME: Record<CertificateKind, string> = { pdf: "application/pdf", jpg: "image/jpeg", png: "image/png" };

/** What a file really is, from its first bytes: its name and type can say anything. */
export function certificateKind(head: Uint8Array): CertificateKind | null {
  const starts = (signature: number[]) => signature.every((b, i) => head[i] === b);
  if (starts([0x25, 0x50, 0x44, 0x46, 0x2d])) return "pdf"; // %PDF-
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (starts([0xff, 0xd8, 0xff])) return "jpg";
  return null;
}

/** Why a file can't be a certificate, or null when it can. */
export function certificateFileBlock(f: { size: number; kind: CertificateKind | null }): string | null {
  if (f.size === 0) return "The file is empty. Choose the certificate file again.";
  if (f.size > CERTIFICATE_MAX_BYTES) return "The file is larger than 5 MB. Save a smaller copy (a scan at a lower resolution, say) and try again.";
  if (!f.kind) return "Only PDF, JPG or PNG files can be uploaded. Save the certificate in one of those formats and try again.";
  return null;
}

/**
 * The name the file is downloaded under: the uploader's, without any folder
 * or characters that don't belong in a file name, ending in the real type.
 */
export function certificateDownloadName(original: string, kind: CertificateKind): string {
  const base =
    original
      .split(/[\\/]/)
      .pop()!
      .replace(/[\u0000-\u001f\u007f"<>:|?*]/g, "")
      .trim()
      .slice(0, 200) || "certificate";
  const ext = kind === "jpg" ? /\.(jpe?g)$/i : new RegExp(`\\.${kind}$`, "i");
  return ext.test(base) ? base : `${base}.${kind}`;
}

export type CertificatePerson = OjtPerson & { staffId: number; attendance: Attendance };

export type CertificateTraining = { type: TrainingType; status: TrainingStatus; startDate: Date; participants: CertificatePerson[] };

const LND_ONLY = "Only the L&D unit can change this training's certificate.";

/**
 * Why the user can't upload, replace or remove a training's certificate, or
 * null when they can. L&D: any training. A clerk: OJT they may change (see
 * ojtChangeBlock). A staff member: an OJT they recorded for themselves.
 */
export function certificateManageBlock(user: SessionUser, t: CertificateTraining): string | null {
  if (can(user, "training.manage")) return null;
  if (t.type !== "OJT") return LND_ONLY;
  const [only, ...others] = t.participants;
  if (only && !others.length && only.staffId === user.id && only.source === "SELF") return null;
  if (can(user, "ojt.manage")) return ojtChangeBlock(user, t.participants);
  return LND_ONLY;
}

/** Why a certificate can't be uploaded to this training now, or null when it can: as above, and not cancelled or still to come. */
export function certificateUploadBlock(user: SessionUser, t: CertificateTraining, today: Date): string | null {
  const block = certificateManageBlock(user, t);
  if (block) return block;
  if (t.status === "CANCELLED") return "This training was cancelled, so it has no certificate.";
  if (dayNumber(t.startDate)! > Math.floor(today.getTime() / 86_400_000)) return "The certificate can be uploaded once the training has started.";
  return null;
}

/**
 * Whether the user may download a training's certificate: L&D; anyone on it
 * who completed it; a clerk, for OJT of the contract staff they look after.
 */
export function certificateDownloadAllowed(user: SessionUser, t: CertificateTraining): boolean {
  if (can(user, "training.view")) return true;
  if (t.participants.some((p) => p.staffId === user.id && p.attendance === "COMPLETED")) return true;
  return t.type === "OJT" && can(user, "ojt.manage") && t.participants.some((p) => p.designation === "CONTRACT");
}
