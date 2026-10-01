import { TONE } from "@/lib/tones";
import { trainingCategory } from "@/lib/trainingCategory";

type Cover = Parameters<typeof trainingCategory>[0];

const SHAPE = { md: "h-28 rounded-[10px]", lg: "h-40 rounded-xl" } as const;

// The ascending-steps motif from the LDMS mark, drawn in the category colour.
const STEPS = [
  { x: 0, h: 34 },
  { x: 22, h: 52 },
  { x: 44, h: 70 },
  { x: 66, h: 88 },
];

/**
 * A training's cover: its category colour, its icon, and the LDMS steps.
 * Trainings have no images, so the cover is drawn from what the training is,
 * and the same category always looks the same.
 */
export function TrainingCover({
  training,
  size = "md",
  className = "",
}: {
  training: Cover;
  /** sm: a list thumbnail; md and lg: card covers. */
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const c = trainingCategory(training);
  const tone = TONE[c.tone];
  const Icon = c.Icon;

  if (size === "sm")
    return (
      <span aria-hidden className={`relative flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-[10px] ${tone.tile} ${className}`}>
        <Icon size={19} strokeWidth={1.9} />
      </span>
    );

  return (
    <div aria-hidden className={`relative overflow-hidden ${tone.soft} ${SHAPE[size]} ${className}`}>
      <svg viewBox="0 0 84 88" className={`absolute right-5 bottom-0 ${size === "md" ? "h-20" : "h-28"} ${tone.deep} opacity-[0.13]`} fill="currentColor">
        {STEPS.map((s) => (
          <rect key={s.x} x={s.x} y={88 - s.h} width="16" height={s.h} rx="3" />
        ))}
      </svg>
      <span className={`absolute top-4 left-4 flex items-center justify-center rounded-xl bg-surface ${tone.deep} ${size === "md" ? "size-10" : "size-12"}`}>
        <Icon size={size === "md" ? 19 : 22} strokeWidth={1.9} />
      </span>
      <span className={`absolute bottom-3.5 left-4 text-[12px] font-semibold ${tone.deep}`}>{c.label}</span>
    </div>
  );
}

/** The category as a small coloured tag, for lists and headers. */
export function CategoryTag({ training }: { training: Cover }) {
  const c = trainingCategory(training);
  return (
    <span className={`tag ${TONE[c.tone].tile}`}>
      <c.Icon size={12} strokeWidth={2.2} aria-hidden />
      {c.label}
    </span>
  );
}
