import { Status } from "@/components/ui/Status";
import type { TrainingPhase } from "@/server/rules/training";

const PHASE: Record<TrainingPhase, { tone: "ok" | "wait" | "bad" | "na"; label: string }> = {
  UPCOMING: { tone: "na", label: "Upcoming" },
  IN_PROGRESS: { tone: "ok", label: "In progress" },
  HELD: { tone: "ok", label: "Held" },
  CANCELLED: { tone: "bad", label: "Cancelled" },
};

export function PhaseStatus({ phase }: { phase: TrainingPhase }) {
  return <Status tone={PHASE[phase].tone}>{PHASE[phase].label}</Status>;
}
