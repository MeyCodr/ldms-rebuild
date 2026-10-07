import Link from "next/link";
import { Panel } from "@/components/Panel";
import { ClickableRow } from "@/components/ui/ClickableRow";
import { Status } from "@/components/ui/Status";
import { formatDateTime, plural } from "@/lib/format";
import { quarterLabel, SKILL_STAGE_LABELS, SKILL_STAGE_TONE } from "@/server/rules/skill";
import type { staffSkillHistory } from "@/server/services/skill";

/** The person's skill matrices, newest quarter first. Nothing when there are none the user can see. */
export function SkillPanel({ history }: { history: Awaited<ReturnType<typeof staffSkillHistory>> }) {
  if (history.length === 0) return null;
  return (
    <Panel
      title="Skill matrix"
      description="One per quarter, newest first"
      action={<span className="text-ink-3">{plural(history.length, "quarter")}</span>}
      flush
    >
      <div className="overflow-x-auto">
        <table className="table min-w-[560px]" aria-label="Skill matrices">
          <thead>
            <tr>
              <th className="w-px pl-5 text-right whitespace-nowrap">No.</th>
              <th className="w-px whitespace-nowrap">Quarter</th>
              <th className="w-px whitespace-nowrap">Status</th>
              <th className="w-px text-right whitespace-nowrap">Topics</th>
              <th className="w-px text-right whitespace-nowrap" title="The average of the topic scores">
                Average
              </th>
              <th>Evaluator</th>
              <th className="w-px pr-5 whitespace-nowrap">Approved</th>
            </tr>
          </thead>
          <tbody>
            {history.map((m, i) => (
              <ClickableRow key={m.id} href={`/skill-matrix/${m.id}`}>
                <td className="num muted pl-5 text-right">{i + 1}</td>
                <td className="whitespace-nowrap">
                  <Link href={`/skill-matrix/${m.id}`} className="font-medium text-ink hover:text-accent hover:underline">
                    {quarterLabel(m)}
                  </Link>
                </td>
                <td className="whitespace-nowrap">
                  <Status tone={SKILL_STAGE_TONE[m.stage]}>{SKILL_STAGE_LABELS[m.stage]}</Status>
                </td>
                <td className="num text-right">{m.topicCount}</td>
                <td className="num text-right font-medium">{m.average !== null ? `${m.average}%` : <span className="muted">–</span>}</td>
                <td>{m.createdBy?.name ?? <span className="muted">–</span>}</td>
                <td className="num pr-5 whitespace-nowrap">{m.approvedAt ? formatDateTime(m.approvedAt).split(",")[0] : <span className="muted">–</span>}</td>
              </ClickableRow>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
