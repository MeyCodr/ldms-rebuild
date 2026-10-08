// Notifications: what goes in a person's list when something happens to one
// of their records. Pure: the wording and where each one leads.
//
// A notification says what happened; "Waiting on you" on the overview says
// what is waiting now. Each is written in the same transaction as the change
// it reports (services/notification.ts), to whoever the change concerns:
// never to the person who made it.

export type NotificationKind =
  | "pme.evaluated" // to the staff member: their HOD has evaluated them
  | "pme.verified" // to the staff member: L&D have verified it
  | "pme.returned" // to the HOD: L&D sent it back
  | "skill.returned" // to the evaluator: the HOD sent it back
  | "skill.approved" // to the evaluator: the HOD approved it
  | "tna.returned" // to whoever fills it in: the HOD or L&D sent it back
  | "tna.approved" // to whoever fills it in
  | "tna.reopened"; // to whoever fills it in: L&D reopened it after approval

export type NewNotification = { staffId: number; kind: NotificationKind; title: string; href: string; entity: "Pme" | "SkillEvaluation" | "Tna"; entityId: number };

/** Kinds that ask the person to do something; shown with the "waiting" dot. */
const ASKS: NotificationKind[] = ["pme.evaluated", "pme.returned", "skill.returned", "tna.returned", "tna.reopened"];
export const notificationAsks = (kind: string) => (ASKS as string[]).includes(kind);

const MAX_TITLE = 200;
const clip = (s: string) => (s.length > MAX_TITLE ? `${s.slice(0, MAX_TITLE - 1)}…` : s);

type PmeFacts = { id: number; participantId: number; staffId: number; staffName: string; training: string };

/** The staff member's own PME opens on their training's page; the HOD's on the PME record. */
export function pmeNotification(kind: "pme.evaluated" | "pme.verified" | "pme.returned", p: PmeFacts, hodId: number | null): NewNotification | null {
  if (kind === "pme.returned") {
    if (hodId === null) return null;
    return { staffId: hodId, kind, title: clip(`L&D sent ${p.staffName}'s PME for ${p.training} back to you to evaluate again.`), href: `/pme/${p.id}`, entity: "Pme", entityId: p.id };
  }
  const title = kind === "pme.evaluated" ? `Your HOD has evaluated your PME for ${p.training}. Open it to acknowledge.` : `L&D have verified your PME for ${p.training}.`;
  return { staffId: p.staffId, kind, title: clip(title), href: `/my-training/${p.participantId}`, entity: "Pme", entityId: p.id };
}

type SkillFacts = { id: number; staffName: string; quarter: string; evaluatorId: number | null };

export function skillNotification(kind: "skill.returned" | "skill.approved", m: SkillFacts, by: string): NewNotification | null {
  if (m.evaluatorId === null) return null;
  const title = kind === "skill.returned" ? `${by} sent ${m.staffName}'s skill matrix for ${m.quarter} back to you.` : `${by} approved ${m.staffName}'s skill matrix for ${m.quarter}.`;
  return { staffId: m.evaluatorId, kind, title: clip(title), href: `/skill-matrix/${m.id}`, entity: "SkillEvaluation", entityId: m.id };
}

type TnaFacts = {
  id: number;
  year: number;
  /** The person it is about, or null for a job grade's. */
  staffId: number | null;
  /** "Job grade 4, Stamping" for a job grade's. */
  gradeName: string;
  /** Who fills in a job grade's: whoever submitted it, else whoever started it. */
  filledById: number | null;
};

/** A person's own TNA opens on My TNA; a job grade's on its record, for the main clerk who fills it in. */
export function tnaNotification(kind: "tna.returned" | "tna.approved" | "tna.reopened", t: TnaFacts, by: string): NewNotification | null {
  const own = t.staffId !== null;
  const staffId = own ? t.staffId : t.filledById;
  if (staffId === null) return null;
  const what = own ? `your TNA for ${t.year}` : `the TNA for ${t.gradeName}, ${t.year}`;
  const title =
    kind === "tna.returned"
      ? `${by} sent ${what} back to you.`
      : kind === "tna.approved"
        ? `${by} approved ${what}.`
        : `${by} reopened ${what}. Change it and submit it again.`;
  return { staffId, kind, title: clip(title), href: own ? `/my-tna?year=${t.year}` : `/tna/${t.id}`, entity: "Tna", entityId: t.id };
}

/** Never tell someone about their own action. */
export function notificationsToWrite(list: (NewNotification | null)[], actorId: number): NewNotification[] {
  return list.filter((n): n is NewNotification => n !== null && n.staffId !== actorId);
}

/** A link is only followed inside LDMS. */
export function safeNotificationHref(href: string): string {
  return href.startsWith("/") && !href.startsWith("//") ? href : "/notifications";
}
