"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Bell, LogOut, Menu, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import { Avatar, StepsMark, Wordmark } from "@/components/brand";
import { MODULE_ICON } from "@/components/moduleIcons";
import { MODULE_TONE, TONE, type ModuleKey, type Tone } from "@/lib/tones";
import { SIDEBAR_COOKIE } from "./sidebarCookie";

export type NavItem = { href: string; label: string; module: ModuleKey; count?: number };
export type NavGroup = { label?: string; items: NavItem[] };

type Props = {
  groups: NavGroup[];
  user: { name: string; staffNo: string; departmentName: string; roleLabel: string; tone: Tone };
  signOut: () => Promise<void>;
  /** Unread notifications, for the bell on the phone and tablet top bar. On desktop the sidebar's Notifications entry carries the count. */
  unread: number;
  /** Desktop only. Labels show by default; people who want more room can collapse to icons. */
  defaultCollapsed: boolean;
};

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

/** Label shown beside an icon when the rail is collapsed. */
function Tip({ children }: { children: React.ReactNode }) {
  return (
    <span
      role="tooltip"
      className="pointer-events-none absolute top-1/2 left-full z-50 ml-3 -translate-y-1/2 rounded-md bg-ink px-2.5 py-1 text-xs font-medium whitespace-nowrap text-white opacity-0 shadow-[var(--shadow-float)] transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
    >
      {children}
    </span>
  );
}

export function Sidebar({ groups, user, signOut, unread, defaultCollapsed }: Props) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `${SIDEBAR_COOKIE}=${next ? "closed" : "open"}; path=/; max-age=31536000; samesite=lax`;
  }

  const renderNav = (rail: boolean) => (
    // Only the labelled nav scrolls: on the rail, overflow would clip the tooltips
    // that sit beside the icons and add a sideways scrollbar.
    <nav aria-label="Main" className={`flex flex-1 flex-col py-4 ${rail ? "gap-3 px-3" : "gap-6 overflow-y-auto px-3"}`}>
      {groups.map((group, i) => (
        <div key={group.label ?? i}>
          {group.label &&
            (rail ? (
              i > 0 && <div aria-hidden className="mx-2 mb-3 border-t border-rule" />
            ) : (
              <div className="eyebrow mb-1.5 px-3 text-[10.5px]">{group.label}</div>
            ))}
          <ul className="flex flex-col gap-0.5">
            {group.items.map((item) => {
              const active = isActive(pathname, item.href);
              const Icon = MODULE_ICON[item.module];
              const tone = TONE[MODULE_TONE[item.module]];
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    aria-label={rail ? item.label : undefined}
                    className={`group relative flex h-10 items-center rounded-lg text-[13.5px] transition-colors ${rail ? "justify-center" : "gap-3 px-2"} ${
                      active ? "bg-sunken font-medium text-ink" : "text-ink-2 hover:bg-sunken/70 hover:text-ink"
                    }`}
                  >
                    <span
                      aria-hidden
                      className={`flex size-7 items-center justify-center rounded-md transition-colors ${active ? tone.tile : "text-ink-3 group-hover:text-ink-2"}`}
                    >
                      <Icon size={16} strokeWidth={1.9} />
                    </span>
                    {rail ? (
                      <>
                        {item.count ? <span aria-hidden className="absolute top-1.5 right-1.5 size-2 rounded-full bg-accent" /> : null}
                        <Tip>
                          {item.label}
                          {item.count ? ` · ${item.count}` : ""}
                        </Tip>
                      </>
                    ) : (
                      <>
                        <span className="flex-1">{item.label}</span>
                        {item.count ? <span className="num rounded-md bg-accent-soft px-1.5 text-xs font-semibold text-accent-deep">{item.count}</span> : null}
                      </>
                    )}
                    {active && !rail && <span aria-hidden className="absolute top-2.5 right-2 bottom-2.5 w-[3px] rounded-full bg-accent" />}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  const renderIdentity = (rail: boolean) =>
    rail ? (
      <div className="flex flex-col items-center gap-2 border-t border-rule py-3.5">
        <Link href="/account" aria-label={`${user.name}, account`} className="group relative rounded-full p-0.5 hover:bg-sunken">
          <Avatar name={user.name} tone={user.tone} size={34} />
          <Tip>
            {user.name} · <span className="num">{user.staffNo}</span>
          </Tip>
        </Link>
        <form action={signOut}>
          <button
            type="submit"
            aria-label="Sign out"
            className="group relative flex size-8 cursor-pointer items-center justify-center rounded-md text-ink-3 hover:bg-sunken hover:text-ink"
          >
            <LogOut size={15} aria-hidden />
            <Tip>Sign out</Tip>
          </button>
        </form>
      </div>
    ) : (
      <div className="border-t border-rule p-3">
        <div className="flex items-center gap-1 rounded-lg p-1">
          <Link href="/account" className="flex min-w-0 flex-1 items-center gap-3 rounded-md p-1 hover:bg-sunken">
            <Avatar name={user.name} tone={user.tone} size={34} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium text-ink" title={user.name}>
                {user.name}
              </span>
              <span className="block truncate text-xs text-ink-3">
                <span className="num">{user.staffNo}</span> · {user.departmentName}
              </span>
            </span>
          </Link>
          <form action={signOut}>
            <button
              type="submit"
              aria-label="Sign out"
              title="Sign out"
              className="flex size-8 cursor-pointer items-center justify-center rounded-md text-ink-3 hover:bg-sunken hover:text-ink"
            >
              <LogOut size={15} aria-hidden />
            </button>
          </form>
        </div>
        {user.roleLabel && <div className="mt-1 px-2 text-xs text-ink-3">{user.roleLabel}</div>}
      </div>
    );

  const toggleButton = (
    <button
      type="button"
      onClick={toggle}
      aria-expanded={!collapsed}
      aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      className="group relative flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-ink-3 hover:bg-sunken hover:text-ink"
    >
      {collapsed ? <PanelLeftOpen size={17} aria-hidden /> : <PanelLeftClose size={17} aria-hidden />}
      {collapsed && <Tip>Expand sidebar</Tip>}
    </button>
  );

  return (
    <>
      {/* Desktop: labels by default, collapsible to an icon rail */}
      <aside
        data-collapsed={collapsed}
        className={`sticky top-0 hidden h-full-screen shrink-0 flex-col border-r border-rule bg-surface transition-[width] duration-200 lg:flex ${collapsed ? "w-[72px]" : "w-[252px]"}`}
      >
        {collapsed ? (
          <div className="flex flex-col items-center gap-2 pt-4 pb-1">
            <Link href="/" aria-label="LDMS overview" className="flex size-9 items-center justify-center">
              <StepsMark size={24} />
            </Link>
            {toggleButton}
          </div>
        ) : (
          <div className="flex h-16 items-center justify-between gap-2 pr-3 pl-5">
            <Link href="/" aria-label="LDMS overview">
              <Wordmark />
            </Link>
            {toggleButton}
          </div>
        )}
        {renderNav(collapsed)}
        {renderIdentity(collapsed)}
      </aside>

      {/* Tablet and phone: top bar with a drawer */}
      <div className="sticky top-0 z-30 flex h-[60px] items-center justify-between border-b border-rule bg-surface/95 px-4 backdrop-blur lg:hidden">
        <Link href="/" aria-label="LDMS overview">
          <Wordmark />
        </Link>
        <div className="flex items-center gap-1">
          <Link
            href="/notifications"
            aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
            className="relative flex size-10 items-center justify-center rounded-lg text-ink-2 hover:bg-sunken"
          >
            <Bell size={19} aria-hidden />
            {unread > 0 && (
              <span aria-hidden className="num absolute top-1 right-0.5 min-w-4 rounded-full bg-accent px-1 text-center text-[10.5px] leading-4 font-semibold text-white">
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </Link>
          <button
            type="button"
            className="flex size-10 items-center justify-center rounded-lg text-ink-2 hover:bg-sunken"
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? "Close menu" : "Menu"}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>
      {open && (
        <div className="fixed inset-0 top-[60px] z-20 lg:hidden">
          <button type="button" aria-label="Close menu" className="absolute inset-0 bg-night/30" onClick={() => setOpen(false)} />
          <aside
            id="mobile-nav"
            className="relative flex h-full w-72 max-w-[85vw] flex-col border-r border-rule bg-surface shadow-[var(--shadow-float)]"
            onClick={(e) => {
              if ((e.target as HTMLElement).closest("a")) setOpen(false);
            }}
          >
            {renderNav(false)}
            {renderIdentity(false)}
          </aside>
        </div>
      )}
    </>
  );
}
