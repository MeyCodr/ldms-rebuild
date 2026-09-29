import { BookOpen, Building2, ClipboardCheck, GraduationCap, History, LayoutDashboard, Target, UserRound, Users, type LucideIcon } from "lucide-react";
import type { ModuleKey } from "@/lib/tones";

export const MODULE_ICON: Record<ModuleKey, LucideIcon> = {
  overview: LayoutDashboard,
  staff: Users,
  organization: Building2,
  audit: History,
  account: UserRound,
  training: GraduationCap,
  pme: ClipboardCheck,
  tna: BookOpen,
  skills: Target,
};
