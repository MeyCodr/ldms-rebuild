import { Status } from "@/components/ui/Status";
import { TRAINING_PHASE_LABELS, type TrainingPhase } from "@/server/rules/training";

const TONE: Record<TrainingPhase, "ok" | "wait" | "bad" | "na"> = { UPCOMING: "na", IN_PROGRESS: "ok", HELD: "ok", CANCELLED: "bad" };

export function PhaseStatus({ phase }: { phase: TrainingPhase }) {
  return <Status tone={TONE[phase]}>{TRAINING_PHASE_LABELS[phase]}</Status>;
}
