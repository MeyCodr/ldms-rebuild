import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Prisma } from "@prisma/client";
import { db } from "../db";
import { UserError } from "../errors";
import type { SessionUser } from "../permissions";
import {
  CERTIFICATE_MIME,
  certificateDownloadAllowed,
  certificateDownloadName,
  certificateFileBlock,
  certificateKind,
  certificateManageBlock,
  certificateUploadBlock,
  type CertificateKind,
} from "../rules/certificate";
import { recordAudit } from "./audit";

// Certificates (module 5): one file per training, kept on disk under
// uploads/certificates/<year>/<random id>.<ext>, outside public/, and only
// handed out by the download route after certificateDownloadAllowed. The
// database holds the stored name and the uploader's file name.

const ROOT = path.resolve(process.env.UPLOAD_DIR ?? path.join(process.cwd(), "uploads"), "certificates");
/** A stored name as uploadCertificate writes it; anything else is never read from disk. */
const STORED = /^\d{4}\/[0-9a-f-]{36}\.(pdf|jpg|png)$/;

function diskPath(stored: string) {
  if (!STORED.test(stored)) throw new Error(`Not a stored certificate name: ${stored}`);
  return path.join(ROOT, ...stored.split("/"));
}

/** Deletes a certificate's file once nothing refers to it. A file already gone is fine. */
export async function discardCertificateFile(stored: string | null | undefined) {
  if (!stored) return;
  try {
    await unlink(diskPath(stored));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") console.error("Couldn't delete certificate file", stored, e);
  }
}

const certificateSelect = {
  id: true,
  title: true,
  type: true,
  status: true,
  startDate: true,
  certificateFile: true,
  certificateName: true,
  certificateAt: true,
  certificateById: true,
  participants: {
    select: { staffId: true, source: true, attendance: true, staff: { select: { name: true, staffNo: true, designation: true } } },
  },
} satisfies Prisma.TrainingSelect;

type Client = Prisma.TransactionClient | typeof db;

async function load(client: Client, trainingId: number) {
  const t = await client.training.findUnique({ where: { id: trainingId }, select: certificateSelect });
  if (!t) return null;
  return { ...t, participants: t.participants.map(({ staff, ...p }) => ({ ...p, ...staff })) };
}

/**
 * What a page shows about a training's certificate: the file (if any), and
 * what this user may do with it. `uploadBlock` and `manageBlock` are null
 * when they may upload, or replace and remove. Null when the training doesn't exist.
 */
export async function certificateInfo(user: SessionUser, trainingId: number, today: Date) {
  const t = await load(db, trainingId);
  if (!t) return null;
  const by = t.certificateById ? await db.staff.findUnique({ where: { id: t.certificateById }, select: { name: true } }) : null;
  return {
    trainingId,
    file: t.certificateFile && t.certificateName ? { name: t.certificateName, at: t.certificateAt, by: by?.name ?? null } : null,
    canDownload: certificateDownloadAllowed(user, t),
    manageBlock: certificateManageBlock(user, t),
    uploadBlock: certificateUploadBlock(user, t, today),
  };
}

export type CertificateInfo = NonNullable<Awaited<ReturnType<typeof certificateInfo>>>;

/** Uploads a training's certificate, replacing any it had. */
export async function uploadCertificate(user: SessionUser, trainingId: number, file: { name: string; bytes: Buffer }, today: Date) {
  const kind = certificateKind(file.bytes.subarray(0, 8));
  const bad = certificateFileBlock({ size: file.bytes.length, kind });
  if (bad) throw new UserError(bad, { certificate: [bad] });
  const before = await load(db, trainingId);
  if (!before) throw new UserError("This training no longer exists.");
  const blocked = certificateUploadBlock(user, before, today);
  if (blocked) throw new UserError(blocked);

  // The file goes on disk first; if saving the record fails, it is removed again.
  const year = String(today.getUTCFullYear());
  const stored = `${year}/${randomUUID()}.${kind}`;
  await mkdir(path.join(ROOT, year), { recursive: true });
  await writeFile(diskPath(stored), file.bytes);
  const name = certificateDownloadName(file.name, kind as CertificateKind);

  let replaced: string | null;
  try {
    replaced = await db.$transaction(async (tx) => {
      const t = await load(tx, trainingId);
      if (!t) throw new UserError("This training no longer exists.");
      const again = certificateUploadBlock(user, t, today);
      if (again) throw new UserError(again);
      await tx.training.update({
        where: { id: trainingId },
        data: { certificateFile: stored, certificateName: name, certificateAt: new Date(), certificateById: user.id },
      });
      await recordAudit(tx, {
        actorId: user.id,
        action: "UPDATE",
        entity: "Training",
        entityId: trainingId,
        summary: `${t.certificateFile ? "Replaced" : "Uploaded"} the certificate for ${t.title} (${name})`,
        changes: { certificate: [t.certificateName, name] },
      });
      return t.certificateFile;
    });
  } catch (e) {
    await discardCertificateFile(stored);
    throw e;
  }
  await discardCertificateFile(replaced);
}

/** Removes a training's certificate. */
export async function removeCertificate(user: SessionUser, trainingId: number) {
  const removed = await db.$transaction(async (tx) => {
    const t = await load(tx, trainingId);
    if (!t) throw new UserError("This training no longer exists.");
    const blocked = certificateManageBlock(user, t);
    if (blocked) throw new UserError(blocked);
    if (!t.certificateFile) throw new UserError("This training has no certificate to remove.");
    await tx.training.update({ where: { id: trainingId }, data: { certificateFile: null, certificateName: null, certificateAt: null, certificateById: null } });
    await recordAudit(tx, {
      actorId: user.id,
      action: "UPDATE",
      entity: "Training",
      entityId: trainingId,
      summary: `Removed the certificate from ${t.title} (${t.certificateName})`,
      changes: { certificate: [t.certificateName, null] },
    });
    return t.certificateFile;
  });
  await discardCertificateFile(removed);
}

/** The certificate's file for the download route, or null when there's none or the user may not have it. */
export async function certificateForDownload(user: SessionUser, trainingId: number) {
  const t = await load(db, trainingId);
  if (!t?.certificateFile || !t.certificateName || !certificateDownloadAllowed(user, t)) return null;
  const kind = t.certificateFile.split(".").pop() as CertificateKind;
  try {
    return { bytes: await readFile(diskPath(t.certificateFile)), name: t.certificateName, mime: CERTIFICATE_MIME[kind] };
  } catch (e) {
    console.error("Certificate file missing", t.certificateFile, e);
    return null;
  }
}
