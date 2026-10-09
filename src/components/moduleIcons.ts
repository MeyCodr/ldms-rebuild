import { BarChart3, Bell, ChartColumnStacked,BookOpen, BookOpenCheck, Building2, ClipboardCheck, GraduationCap, History, Inbox, LayoutDashboard, MailCheck, ScanSearch, Target, UserRound, Users, Wrench, type LucideIcon } from "lucide-react";
import type { ModuleKey } from "@/lib/tones";

export const MODULE_ICON: Record<ModuleKey, LucideIcon> = {
  overview: LayoutDashboard,
  staff: Users,
  organization: Building2,
  audit: History,
  account: UserRound,
  learning: BookOpenCheck,
  training: GraduationCap,
  ojt: Wrench,
  reports: BarChart3,
  dashboard: ChartColumnStacked,
  approvals: Inbox,
  pme: ClipboardCheck,
  tna: BookOpen,
  tni: ScanSearch,
  skills: Target,
  jobs: MailCheck,
  notifications: Bell,
};
