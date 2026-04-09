import type { LucideIcon } from "lucide-react";

export type SpielwieseNavItem = {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  isActive?: boolean;
  badge?: string;
};

export type SpielwieseFavoriteItem = {
  id: string;
  label: string;
  href: string;
};

export type SpielwieseWorkspacePage = {
  id: string;
  label: string;
  href: string;
};

export type SpielwieseWorkspaceGroup = {
  id: string;
  label: string;
  emoji: string;
  defaultOpen?: boolean;
  pages: SpielwieseWorkspacePage[];
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
  primaryNav: SpielwieseNavItem[];
  secondaryNav: SpielwieseNavItem[];
  favorites: SpielwieseFavoriteItem[];
  workspaces: SpielwieseWorkspaceGroup[];
  rightRailTitle: string;
};
