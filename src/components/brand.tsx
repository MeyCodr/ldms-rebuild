import { TONE, type Tone } from "@/lib/tones";

/**
 * The LDMS mark: four ascending steps, one per learning colour. It stands for
 * progress through training, evaluation and skills.
 */
export function StepsMark({ size = 22, className = "" }: { size?: number; className?: string }) {
  const bars: { x: number; h: number; fill: string }[] = [
    { x: 0, h: 8, fill: "var(--color-marigold)" },
    { x: 6, h: 12, fill: "var(--color-coral)" },
    { x: 12, h: 16, fill: "var(--color-accent-bright)" },
    { x: 18, h: 20, fill: "#8fb4de" },
  ];
  return (
    <svg width={size} height={size} viewBox="0 0 22 20" aria-hidden className={className}>
      {bars.map((b) => (
        <rect key={b.x} x={b.x} y={20 - b.h} width="4" height={b.h} rx="1" fill={b.fill} />
      ))}
    </svg>
  );
}

export function Wordmark({ onDark = false, full = false }: { onDark?: boolean; full?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <StepsMark />
      <span className="flex flex-col leading-none">
        <span className={`display text-[17px] font-bold tracking-tight ${onDark ? "text-white" : "text-ink"}`}>LDMS</span>
        <span className={`mt-0.5 text-[10.5px] tracking-wide ${onDark ? "text-night-muted" : "text-ink-3"}`}>{full ? "PHN Industry · Learning & Development" : "PHN Industry"}</span>
      </span>
    </span>
  );
}

function initials(name: string): string {
  const words = name
    .replace(/\b(bin|binti|a\/l|a\/p|bt|b\.)\b/gi, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return "?";
  const first = words[0][0];
  const second = words.length > 1 ? words[1][0] : (words[0][1] ?? "");
  return (first + second).toUpperCase();
}

/** Initials in the colour of the person's division. */
export function Avatar({ name, tone, size = 28 }: { name: string; tone: Tone; size?: number }) {
  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold ${TONE[tone].tile}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
    >
      {initials(name)}
    </span>
  );
}

/** Small square marker for a division, used beside department names. */
export function DivisionMark({ tone, className = "" }: { tone: Tone; className?: string }) {
  return <span aria-hidden className={`inline-block size-2 shrink-0 rounded-[2px] ${TONE[tone].solid} ${className}`} />;
}
