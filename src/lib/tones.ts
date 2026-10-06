// The learning palette, as Tailwind class sets. Class names are written out in
// full so Tailwind can find them.
//
// Tones have jobs:
// - each module has one (page header tile, nav icon when active)
// - each division has one (avatars, department markers, headcount bars)

export type Tone = "jade" | "marigold" | "coral" | "cobalt" | "plum" | "olive" | "slate";

export const TONE: Record<Tone, { solid: string; soft: string; deep: string; tile: string; bar: string; border: string }> = {
  jade: { solid: "bg-jade", soft: "bg-jade-soft", deep: "text-jade-deep", tile: "bg-jade-soft text-jade-deep", bar: "bg-jade", border: "border-jade" },
  marigold: { solid: "bg-marigold", soft: "bg-marigold-soft", deep: "text-marigold-deep", tile: "bg-marigold-soft text-marigold-deep", bar: "bg-marigold", border: "border-marigold" },
  coral: { solid: "bg-coral", soft: "bg-coral-soft", deep: "text-coral-deep", tile: "bg-coral-soft text-coral-deep", bar: "bg-coral", border: "border-coral" },
  cobalt: { solid: "bg-cobalt", soft: "bg-cobalt-soft", deep: "text-cobalt-deep", tile: "bg-cobalt-soft text-cobalt-deep", bar: "bg-cobalt", border: "border-cobalt" },
  plum: { solid: "bg-plum", soft: "bg-plum-soft", deep: "text-plum-deep", tile: "bg-plum-soft text-plum-deep", bar: "bg-plum", border: "border-plum" },
  olive: { solid: "bg-olive", soft: "bg-olive-soft", deep: "text-olive-deep", tile: "bg-olive-soft text-olive-deep", bar: "bg-olive", border: "border-olive" },
  slate: { solid: "bg-slate", soft: "bg-slate-soft", deep: "text-slate-deep", tile: "bg-slate-soft text-slate-deep", bar: "bg-slate", border: "border-slate" },
};

export const MODULE_TONE = {
  overview: "jade",
  staff: "cobalt",
  organization: "plum",
  audit: "slate",
  account: "marigold",
  learning: "jade", // My training: the person's own learning
  // later phases
  training: "marigold",
  ojt: "olive", // OJT that clerks and L&D record for staff
  reports: "coral",
  approvals: "marigold", // what is waiting on a HOD or L&D
  pme: "coral",
  tna: "jade",
  skills: "olive",
} as const satisfies Record<string, Tone>;

export type ModuleKey = keyof typeof MODULE_TONE;

const DIVISION_TONES: Tone[] = ["cobalt", "marigold", "jade", "plum", "coral", "olive"];

/** A division keeps the same colour everywhere it appears. */
export function divisionTone(divisionId: number | null | undefined): Tone {
  if (!divisionId) return "slate";
  return DIVISION_TONES[(divisionId - 1) % DIVISION_TONES.length];
}
