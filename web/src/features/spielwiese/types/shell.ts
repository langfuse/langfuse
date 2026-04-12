import type { LucideIcon } from "lucide-react";

export type SpielwieseNavItem = {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  isActive?: boolean;
  badge?: string;
  count?: string;
  actionIcon?: LucideIcon;
};

export type SpielwieseNavGroup = {
  id: string;
  items: SpielwieseNavItem[];
};

export type SpielwieseSidebarTreeItem = {
  id: string;
  label: string;
  href: string;
  count?: string;
  defaultOpen?: boolean;
  emoji?: string;
  icon?: LucideIcon;
  isActive?: boolean;
  isDummy?: boolean;
  children?: SpielwieseSidebarTreeItem[];
};

export type SpielwieseSidebarSection = {
  id: string;
  label: string;
  icon: LucideIcon;
  actionIcon?: LucideIcon;
  defaultOpen?: boolean;
  emptyState?: string;
  items: SpielwieseSidebarTreeItem[];
};

export type SpielwieseFooterTool = {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
};

export type SpielwieseUsage = {
  ctaLabel: string;
  label: string;
  limit: number;
  used: number;
};

export type SpielwieseUser = {
  name: string;
  email: string;
  initials: string;
};

export type SpielwieseTeam = {
  name: string;
  plan: string;
  initials: string;
};

export type SpielwieseShellVM = {
  productLabel: string;
  workspaceLabel: string;
  team: SpielwieseTeam;
  user: SpielwieseUser;
  utilityNavGroups: SpielwieseNavGroup[];
  sidebarSections: SpielwieseSidebarSection[];
  footerTools: SpielwieseFooterTool[];
  usage: SpielwieseUsage;
};
