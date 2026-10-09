import { Briefcase, Compass, GraduationCap, Lightbulb, MonitorSmartphone, Wrench, type LucideIcon } from "lucide-react";
import type { Tone } from "./tones";
import { TRAINING_FUNCTION_LABELS } from "./validation/training";

type CategoryInput = { type: "PUBLIC_INHOUSE" | "OJT"; function?: keyof typeof TRAINING_FUNCTION_LABELS | null };

export type TrainingCategory = { label: string; tone: Tone; Icon: LucideIcon };

const BY_FUNCTION: Record<keyof typeof TRAINING_FUNCTION_LABELS, Omit<TrainingCategory, "label">> = {
  BUSINESS: { tone: "cobalt", Icon: Briefcase },
  DIGITAL: { tone: "jade", Icon: MonitorSmartphone },
  LEADERSHIP: { tone: "plum", Icon: Compass },
  PERSONAL_EFFECTIVENESS: { tone: "marigold", Icon: Lightbulb },
};

/**
 * How a training is labelled and coloured wherever it appears (covers, tags,
 * lists): OJT by its type, which says more about it than the function;
 * courses by their function. The same training always
 * looks the same.
 */
export function trainingCategory(t: CategoryInput): TrainingCategory {
  if (t.type === "OJT") return { label: "On-the-job", tone: "olive", Icon: Wrench };
  if (t.function) return { label: TRAINING_FUNCTION_LABELS[t.function], ...BY_FUNCTION[t.function] };
  return { label: "Training", tone: "slate", Icon: GraduationCap };
}
