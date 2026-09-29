"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { LogOut, Menu, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
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
  /** Desktop only. The rail is the default; people who prefer labels can expand it. */
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
      className="pointer-events-none absolute top-1/2 left-full z-50 ml-3 -translate-y-1/2 rounded-md bg-ink px-2.5 py-1 text-xs font-medium whitespace-nowrap text-white opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
    >
      {children}
    </span>
  );
}

export function Sidebar({ groups, user, signOut, defaultCollapsed }: Props) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `${SIDEBAR_COOKIE}=${next ? "closed" : "open"}; path=/; max-age=31536000; samesite=lax`;
  }

  const renderNav = (rail: boolean) => (
    <nav aria-label="Main" className={`flex flex-1 flex-col py-5 ${rail ? "gap-3 px-3" : "gap-6 overflow-y-auto px-3"}`}>
      {groups.map((group, i) => (
        <div key={group.label ?? i}>
          {group.label &&
            (rail ? (
              i > 0 && <div aria-hidden className="mx-2 mb-3 border-t border-night-2" />
            ) : (
              <div className="mb-1.5 px-3 text-2xs font-semibold tracking-[0.1em] text-night-muted uppercase">{group.label}</div>
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
                    className={`group relative flex h-9 items-center rounded-md text-[13.5px] transition-colors ${rail ? "justify-center" : "gap-3 px-3"} ${
                      active ? "bg-night-2 font-medium text-white" : "text-night-text hover:bg-night-2/60 hover:text-white"
                    }`}
                  >
                    {active && <span aria-hidden className="absolute top-2 bottom-2 -left-3 w-1 rounded-r bg-accent-bright" />}
                    <span
                      aria-hidden
                      className={`flex size-6 items-center justify-center rounded-[5px] ${active ? tone.tile : "text-night-muted group-hover:text-night-text"}`}
                    >
                      <Icon size={15} strokeWidth={2} />
                    </span>
                    {rail ? (
                      <>
                        {item.count ? <span aria-hidden className="absolute top-1.5 right-1.5 size-2 rounded-full bg-accent-bright" /> : null}
                        <Tip>
                          {item.label}
                          {item.count ? ` · ${item.count}` : ""}
                        </Tip>
                      </>
                    ) : (
                      <>
                        <span className="flex-1">{item.label}</span>
                        {item.count ? <span className="num rounded bg-accent-bright px-1.5 text-xs font-medium text-night">{item.count}</span> : null}
                      </>
                    )}
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
      <div className="flex flex-col items-center gap-2 border-t border-night-2 py-3.5">
        <Link href="/account" aria-label={`${user.name}, account`} className="group relative rounded-full p-0.5 hover:bg-night-2/60">
          <Avatar name={user.name} tone={user.tone} size={34} />
          <Tip>
            {user.name} · <span className="num">{user.staffNo}</span>
          </Tip>
        </Link>
        <form action={signOut}>
          <button type="submit" aria-label="Sign out" className="group relative flex size-8 cursor-pointer items-center justify-center rounded-md text-night-muted hover:bg-night-2/60 hover:text-white">
            <LogOut size={15} aria-hidden />
            <Tip>Sign out</Tip>
          </button>
        </form>
      </div>
    ) : (
      <div className="border-t border-night-2 px-4 py-3.5">
        <Link href="/account" className="flex items-center gap-3 rounded-md p-1 hover:bg-night-2/60">
          <Avatar name={user.name} tone={user.tone} size={34} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-medium text-white" title={user.name}>
              {user.name}
            </span>
            <span className="block truncate text-xs text-night-muted">
              <span className="num">{user.staffNo}</span> · {user.departmentName}
            </span>
          </span>
        </Link>
        {user.roleLabel && <div className="mt-2 px-1 text-xs text-night-muted">{user.roleLabel}</div>}
        <form action={signOut} className="mt-2 px-1">
          <button type="submit" className="flex cursor-pointer items-center gap-1.5 text-xs text-night-text hover:text-white">
            <LogOut size={13} aria-hidden /> Sign out
          </button>
        </form>
      </div>
    );

  const toggleButton = (
    <button
      type="button"
      onClick={toggle}
      aria-expanded={!collapsed}
      aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      className="group relative flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-night-muted hover:bg-night-2 hover:text-white"
    >
      {collapsed ? <PanelLeftOpen size={17} aria-hidden /> : <PanelLeftClose size={17} aria-hidden />}
      {collapsed && <Tip>Expand sidebar</Tip>}
    </button>
  );

  return (
    <>
      {/* Desktop: an icon rail by default, expandable to show labels */}
      <aside
        data-collapsed={collapsed}
        className={`sticky top-0 hidden h-screen shrink-0 flex-col bg-night transition-[width] duration-200 lg:flex ${collapsed ? "w-[68px]" : "w-60"}`}
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
              <Wordmark onDark />
            </Link>
            {toggleButton}
          </div>
        )}
        {renderNav(collapsed)}
        {renderIdentity(collapsed)}
      </aside>

      {/* Tablet and phone: top bar with a drawer */}
      <div className="sticky top-0 z-30 flex h-14 items-center justify-between bg-night px-4 lg:hidden">
        <Link href="/" aria-label="LDMS overview">
          <Wordmark onDark />
        </Link>
        <button
          type="button"
          className="flex size-9 items-center justify-center rounded-md text-night-text hover:bg-night-2"
          aria-expanded={open}
          aria-controls="mobile-nav"
          aria-label={open ? "Close menu" : "Menu"}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>
      {open && (
        <div className="fixed inset-0 top-14 z-20 lg:hidden">
          <button type="button" aria-label="Close menu" className="absolute inset-0 bg-night/40" onClick={() => setOpen(false)} />
          <aside
            id="mobile-nav"
            className="relative flex h-full w-72 max-w-[85vw] flex-col bg-night"
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
