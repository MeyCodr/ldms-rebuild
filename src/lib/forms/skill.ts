// The skill matrix form: three sections, each a list of topics the evaluator
// types in; each topic holds up to five lines, each a sentence and a rating.
// The old system's form (staff/office/skill-matrix/evaluation-matrix.php).
// No database or server code here, so the form and the server check the same way.

export const SKILL_SECTIONS = ["KNOWLEDGE", "SKILL", "ABILITY"] as const;
export type SkillSectionKey = (typeof SKILL_SECTIONS)[number];

export const SKILL_SECTION_LABELS: Record<SkillSectionKey, string> = { KNOWLEDGE: "Knowledge", SKILL: "Skill", ABILITY: "Ability" };
export const SKILL_SECTION_HINTS: Record<SkillSectionKey, string> = {
  KNOWLEDGE: "What the person knows: procedures, standards, how the machine or process works.",
  SKILL: "What the person can do with their hands and tools.",
  ABILITY: "How the person works: with others, under pressure, solving problems.",
};

/** The rating of a line, lowest first. */
export const SKILL_RATINGS = [
  { value: 1, label: "Beginner" },
  { value: 2, label: "Basic" },
  { value: 3, label: "Competent" },
  { value: 4, label: "Advanced" },
  { value: 5, label: "Expert" },
] as const;
export const skillRatingLabel = (rating: number) => SKILL_RATINGS.find((r) => r.value === rating)?.label ?? "";

export const MAX_SKILL_LINES = 5; // per topic, as in the old form
export const MAX_SKILL_TOPICS = 20; // per section
export const MAX_SKILL_TOPIC_NAME = 500;
export const MAX_SKILL_LINE = 1000;

export type SkillLine = { text: string; rating: number | null };
export type SkillTopic = { section: SkillSectionKey; name: string; items: SkillLine[] };
/** A matrix's content: its topics in order, each section's together. */
export type SkillContent = SkillTopic[];

/** A problem with the content, tied to a section or to a topic (its position in the content). */
export type SkillProblem = { at: { section: SkillSectionKey } | { topic: number }; message: string };

/**
 * Reads the form's content (JSON) and tidies it: text trimmed, lines left
 * completely blank dropped, topics with neither a name nor a line dropped,
 * sections put in order. Null when it isn't the form's shape at all.
 */
export function parseSkillContent(json: string): SkillContent | null {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return null;
  }
  if (!Array.isArray(raw)) return null;
  const topics: SkillContent = [];
  for (const t of raw) {
    if (!t || typeof t !== "object") return null;
    const { section, name, items } = t as Record<string, unknown>;
    if (!SKILL_SECTIONS.includes(section as SkillSectionKey) || typeof name !== "string" || !Array.isArray(items)) return null;
    const lines: SkillLine[] = [];
    for (const i of items) {
      if (!i || typeof i !== "object") return null;
      const { text, rating } = i as Record<string, unknown>;
      if (typeof text !== "string" || !(rating === null || (Number.isInteger(rating) && (rating as number) >= 1 && (rating as number) <= 5))) return null;
      if (text.trim() || rating !== null) lines.push({ text: text.trim(), rating: rating as number | null });
    }
    if (name.trim() || lines.length) topics.push({ section: section as SkillSectionKey, name: name.trim(), items: lines });
  }
  return SKILL_SECTIONS.flatMap((s) => topics.filter((t) => t.section === s));
}

/**
 * What is wrong with a matrix's content. A draft only has to be storable: it
 * may be unfinished. To submit, every section needs a topic, every topic a
 * name and a line, and every line a sentence and a rating.
 */
export function skillContentProblems(content: SkillContent, mode: "draft" | "submit"): SkillProblem[] {
  const problems: SkillProblem[] = [];
  if (content.length === 0) return [{ at: { section: "KNOWLEDGE" }, message: "Add at least one topic before saving." }];
  for (const section of SKILL_SECTIONS) {
    const count = content.filter((t) => t.section === section).length;
    if (count > MAX_SKILL_TOPICS) problems.push({ at: { section }, message: `At most ${MAX_SKILL_TOPICS} topics in a section.` });
    if (mode === "submit" && count === 0) problems.push({ at: { section }, message: `Add at least one ${SKILL_SECTION_LABELS[section].toLowerCase()} topic.` });
  }
  content.forEach((t, topic) => {
    const say = (message: string) => problems.push({ at: { topic }, message });
    if (!t.name) say("Give this topic a name.");
    else if (t.name.length > MAX_SKILL_TOPIC_NAME) say(`Keep the topic's name under ${MAX_SKILL_TOPIC_NAME} characters.`);
    if (t.items.length > MAX_SKILL_LINES) say(`At most ${MAX_SKILL_LINES} lines in a topic.`);
    if (t.items.some((i) => i.text.length > MAX_SKILL_LINE)) say(`Keep each line under ${MAX_SKILL_LINE} characters.`);
    if (t.items.some((i) => !i.text)) say("A line has a rating but nothing written.");
    if (mode === "submit") {
      if (t.items.length === 0) say("Add at least one line to this topic.");
      else if (t.items.some((i) => i.text && i.rating === null)) say("Rate every line.");
    }
  });
  return problems;
}
