import { PME_STAGE_LABELS, type PmeStage } from "@/server/rules/pme";

/** The stages in the staff member's own words, for My training and their PME page. */
const OWN_STAGE_LABELS: Record<PmeStage, string> = {
  IN_PERIOD: "In evaluation period",
  TO_EVALUATE: "Waiting for your HOD",
  TO_ACKNOWLEDGE: "To acknowledge",
  TO_VERIFY: "Waiting for L&D",
  VERIFIED: "Verified",
  NOT_REQUIRED: "Not required",
};

/** How a stage reads: to the person the PME is about, or to everyone else. */
export const pmeStageLabel = (stage: PmeStage, own: boolean) => (own ? OWN_STAGE_LABELS : PME_STAGE_LABELS)[stage];

/** 82.5, 80: a mark out of 100. */
export const formatMark = (mark: number) => mark.toLocaleString("en-MY", { maximumFractionDigits: 2 });
