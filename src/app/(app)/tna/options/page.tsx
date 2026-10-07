import type { Metadata } from "next";
import Link from "next/link";
import { FileSpreadsheet, Upload } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Panel } from "@/components/Panel";
import { withBasePath } from "@/lib/base-path";
import { TNA_SECTION_HINTS, TNA_SECTION_LABELS, TNA_SECTIONS, tnaSectionLetter, tnaSectionTitle, type TnaSectionKey } from "@/lib/forms/tna";
import { plural } from "@/lib/format";
import { tnaOptionList } from "@/server/services/tnaOptions";
import { requirePermission } from "@/server/session";
import { AddGroupDialog, AddOptionDialog, DeleteGroupDialog, OptionTable, RenameGroupDialog } from "./OptionActions";

export const metadata: Metadata = { title: "TNA training options" };

/** L&D's lists for the TNA form's "Training required": one per heading, optionally in groups. */
export default async function TnaOptionsPage({ searchParams }: PageProps<"/tna/options">) {
  const user = await requirePermission("tna.manage");
  const raw = (await searchParams).section;
  const section: TnaSectionKey = (TNA_SECTIONS as readonly string[]).includes(String(raw)) ? (raw as TnaSectionKey) : "ESG";
  const list = await tnaOptionList(user, section);
  const title = tnaSectionTitle(section);
  const groups = list.categories.map((c) => ({ id: c.id, name: c.name }));

  return (
    <div>
      <PageHeader
        module="tna"
        context={{ href: "/tna", label: "TNA" }}
        title="Training options"
        meta={<span>What staff choose from under &ldquo;Training required&rdquo;. Every list also offers Others, to type a name in.</span>}
        actions={
          <>
            <a href={withBasePath("/tna/options/export")} className="btn" download>
              <FileSpreadsheet size={15} aria-hidden /> Download Excel
            </a>
            <Link href="/tna/options/import" className="btn">
              <Upload size={15} aria-hidden /> Import from Excel
            </Link>
          </>
        }
      />

      <nav aria-label="Headings of the form" className="mb-4 flex flex-wrap gap-1.5">
        {TNA_SECTIONS.map((s) => (
          <Link key={s} href={`/tna/options?section=${s}`} aria-current={s === section ? "page" : undefined} title={tnaSectionTitle(s)} className={`btn btn-sm ${s === section ? "btn-primary" : ""}`}>
            {tnaSectionLetter(s)}. {TNA_SECTION_LABELS[s]} <span className={`num ${s === section ? "opacity-80" : "text-ink-3"}`}>{list.perSection[s]}</span>
          </Link>
        ))}
      </nav>

      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="display text-[17px] font-semibold">{title}</h2>
            <p className="text-[13px] text-ink-2">
              {TNA_SECTION_HINTS[section]} {plural(list.total, "option")}
              {list.categories.length > 0 && ` in ${plural(list.categories.length, "group")}`}.
            </p>
          </div>
          <div className="flex gap-2">
            <AddGroupDialog section={section} sectionTitle={title} />
            <AddOptionDialog section={section} sectionTitle={title} groups={groups} />
          </div>
        </div>

        {list.groups.length === 0 && (
          <div className="card px-5 py-8 text-center text-[13px] text-ink-3">This list is empty, so staff type every training in under Others. Add an option to give them a list.</div>
        )}

        {list.groups.map((g) => (
          <Panel
            key={g.category?.id ?? 0}
            title={g.category?.name ?? (list.categories.length ? "Not in a group" : "Options")}
            action={
              <div className="flex items-center gap-1">
                <span className="mr-2 text-ink-3">{plural(g.options.length, "option")}</span>
                {g.category && (
                  <>
                    <AddOptionDialog section={section} sectionTitle={title} groups={groups} group={g.category.id} />
                    <RenameGroupDialog id={g.category.id} name={g.category.name} />
                    {g.options.length === 0 && <DeleteGroupDialog id={g.category.id} name={g.category.name} />}
                  </>
                )}
              </div>
            }
            flush
          >
            {g.options.length === 0 ? (
              <p className="px-5 py-4 text-[13px] text-ink-3">No options in this group yet.</p>
            ) : (
              <OptionTable label={g.category?.name ?? "Options"} groups={groups} options={g.options.map((o) => ({ id: o.id, name: o.name, active: o.active, categoryId: o.categoryId, used: o._count.items }))} />
            )}
          </Panel>
        ))}
      </div>
    </div>
  );
}
