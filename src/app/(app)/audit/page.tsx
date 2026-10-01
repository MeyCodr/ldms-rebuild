import type { Metadata } from "next";
import Link from "next/link";
import type { AuditAction, Prisma } from "@prisma/client";
import { PageHeader } from "@/components/PageHeader";
import { Select } from "@/components/ui/Select";
import { formatDateTime } from "@/lib/format";
import { db } from "@/server/db";
import { requirePermission } from "@/server/session";

export const metadata: Metadata = { title: "Audit log" };

const PAGE = 100;
const ENTITIES = ["Staff", "Training", "Participant", "Department", "Division", "Section"] as const;
const ACTIONS: AuditAction[] = ["CREATE", "UPDATE", "DELETE", "IMPORT"];
const ACTION_LABEL: Record<AuditAction, string> = { CREATE: "Added", UPDATE: "Changed", DELETE: "Deleted", IMPORT: "Import" };

function recordHref(entity: string, id: string | null): string | null {
  if (!id || !/^\d+$/.test(id)) return null;
  if (entity === "Staff") return `/staff/${id}`;
  // Participant entries carry the training's id.
  if (entity === "Training" || entity === "Participant") return `/trainings/${id}`;
  if (entity === "Department") return `/organization/departments/${id}`;
  if (entity === "Division") return `/organization#division-${id}`;
  return null;
}

export default async function AuditPage({ searchParams }: PageProps<"/audit">) {
  await requirePermission("audit.view");
  const sp = await searchParams;
  const entity = typeof sp.entity === "string" && (ENTITIES as readonly string[]).includes(sp.entity) ? sp.entity : "";
  const action = typeof sp.action === "string" && (ACTIONS as string[]).includes(sp.action) ? (sp.action as AuditAction) : "";
  const q = typeof sp.q === "string" ? sp.q.slice(0, 80) : "";
  const before = typeof sp.before === "string" && /^\d+$/.test(sp.before) ? BigInt(sp.before) : null;

  const where: Prisma.AuditLogWhereInput = {
    ...(entity && { entity }),
    ...(action && { action }),
    ...(q && { OR: [{ summary: { contains: q } }, { actor: { name: { contains: q } } }] }),
    ...(before && { id: { lt: before } }),
  };
  const rows = await db.auditLog.findMany({
    where,
    orderBy: { id: "desc" },
    take: PAGE + 1,
    include: { actor: { select: { id: true, name: true } } },
  });
  const more = rows.length > PAGE;
  const shown = rows.slice(0, PAGE);
  const filterQuery = new URLSearchParams({ ...(entity && { entity }), ...(action && { action }), ...(q && { q }) });

  return (
    <div className="page-fit mx-auto max-w-[1280px]">
      <PageHeader module="audit" context="Administration" title="Audit log" meta={<span>Every change to trainings, the org chart and staff records, newest first.</span>} />

      <form method="get" className="flex flex-wrap items-end gap-2 card p-3" role="search" aria-label="Filter audit log">
        <div className="w-full sm:w-72">
          <label htmlFor="q" className="sr-only">
            Search
          </label>
          <input id="q" name="q" defaultValue={q} type="search" className="input" placeholder="Name of the person or record" />
        </div>
        <div className="w-[calc(50%-4px)] sm:w-40">
          <label htmlFor="entity" className="sr-only">
            Record type
          </label>
          <Select id="entity" name="entity" defaultValue={entity} options={[{ value: "", label: "All records" }, ...ENTITIES.map((e) => ({ value: e, label: e }))]} />
        </div>
        <div className="w-[calc(50%-4px)] sm:w-36">
          <label htmlFor="action" className="sr-only">
            Action
          </label>
          <Select id="action" name="action" defaultValue={action} options={[{ value: "", label: "All actions" }, ...ACTIONS.map((a) => ({ value: a, label: ACTION_LABEL[a] }))]} />
        </div>
        <button type="submit" className="btn">
          Apply
        </button>
        {(entity || action || q) && (
          <Link href="/audit" className="btn btn-ghost">
            Clear
          </Link>
        )}
      </form>

      <div className="table-scroll mt-4 card">
        <table className="table">
          <thead>
            <tr>
              <th className="w-40">When</th>
              <th className="w-48">By</th>
              <th className="w-24">Action</th>
              <th>What changed</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const href = recordHref(r.entity, r.entityId);
              const changes = r.changes && typeof r.changes === "object" && !Array.isArray(r.changes) ? (r.changes as Record<string, [unknown, unknown]>) : null;
              return (
                <tr key={String(r.id)}>
                  <td className="num whitespace-nowrap">{formatDateTime(r.createdAt)}</td>
                  <td>{r.actor ? <Link href={`/staff/${r.actor.id}`} className="link">{r.actor.name}</Link> : <span className="muted">System</span>}</td>
                  <td>{ACTION_LABEL[r.action]}</td>
                  <td>
                    {href ? (
                      <Link href={href} className="link">
                        {r.summary}
                      </Link>
                    ) : (
                      r.summary
                    )}
                    {changes && (
                      <div className="mt-0.5 text-xs text-ink-2">
                        {Object.entries(changes).map(([k, [a, b]]) => (
                          <span key={k} className="mr-3 inline-block">
                            {k}: <span className="text-ink-3">{String(a ?? "blank")}</span> → {String(b ?? "blank")}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {shown.length === 0 && <div className="px-4 py-10 text-center text-[13px] text-ink-2">No entries match.</div>}
      </div>
      {more && (
        <div className="mt-3 shrink-0">
          <Link href={`/audit?${filterQuery.toString()}${filterQuery.size ? "&" : ""}before=${String(shown[shown.length - 1].id)}`} className="btn btn-sm">
            Older entries
          </Link>
        </div>
      )}
    </div>
  );
}
