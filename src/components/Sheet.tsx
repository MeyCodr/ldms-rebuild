import { Panel } from "./Panel";

/** A panel of label/value rows, for record pages (staff, training). */
export function Sheet({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Panel title={title} action={action}>
      <dl className="-my-2 text-[13.5px]">{children}</dl>
    </Panel>
  );
}

export function SheetItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[130px_1fr] gap-3 border-b border-rule py-2 last:border-b-0 sm:grid-cols-[160px_1fr]">
      <dt className="text-ink-3">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}
