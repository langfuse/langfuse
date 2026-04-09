import {
  BarChart3,
  FlaskConical,
  FolderKanban,
  Home,
  LifeBuoy,
  Search,
  Settings2,
  Sparkles,
} from "lucide-react";
import type { SpielwieseShellVM } from "../types/shell";

export const spielwieseShellMock: SpielwieseShellVM = {
  productLabel: "Langfuse",
  workspaceLabel: "Spielwiese",
  team: {
    name: "Iteration Lab",
    plan: "Design sandbox",
    initials: "IL",
  },
  user: {
    name: "Louis Ville",
    email: "louis@langfuse.dev",
    initials: "LV",
  },
  primaryNav: [
    {
      id: "search",
      label: "Search",
      href: "#search",
      icon: Search,
    },
    {
      id: "assist",
      label: "Ask AI",
      href: "#assist",
      icon: Sparkles,
    },
    {
      id: "overview",
      label: "Overview",
      href: "#overview",
      icon: Home,
      isActive: true,
    },
    {
      id: "dashboards",
      label: "Dashboards",
      href: "#dashboards",
      icon: BarChart3,
      badge: "7",
    },
  ],
  secondaryNav: [
    {
      id: "experiments",
      label: "Experiments",
      href: "#experiments",
      icon: FlaskConical,
    },
    {
      id: "workflows",
      label: "Workflows",
      href: "#workflows",
      icon: FolderKanban,
    },
    {
      id: "settings",
      label: "Settings",
      href: "#settings",
      icon: Settings2,
    },
    {
      id: "help",
      label: "Help",
      href: "#help",
      icon: LifeBuoy,
    },
  ],
  favorites: [
    {
      id: "triage",
      label: "Support triage dashboard",
      href: "#triage",
    },
    {
      id: "iter-doc",
      label: "Iteration notes for prompt review",
      href: "#iter-doc",
    },
    {
      id: "handoff",
      label: "Designer handoff checklist",
      href: "#handoff",
    },
  ],
  workspaces: [
    {
      id: "ops",
      label: "Operations",
      emoji: "🧭",
      defaultOpen: true,
      pages: [
        {
          id: "queue",
          label: "Review queue",
          href: "#queue",
        },
        {
          id: "handoff",
          label: "Handoff notes",
          href: "#handoff",
        },
        {
          id: "coverage",
          label: "Coverage map",
          href: "#coverage",
        },
      ],
    },
    {
      id: "quality",
      label: "Prompt quality",
      emoji: "🧪",
      pages: [
        {
          id: "pairs",
          label: "Prompt pairs",
          href: "#pairs",
        },
        {
          id: "variants",
          label: "Variant ledger",
          href: "#variants",
        },
        {
          id: "scores",
          label: "Score snapshots",
          href: "#scores",
        },
      ],
    },
    {
      id: "signal",
      label: "Signal studio",
      emoji: "📡",
      pages: [
        {
          id: "monitors",
          label: "Monitor cuts",
          href: "#monitors",
        },
        {
          id: "annotations",
          label: "Annotations",
          href: "#annotations",
        },
        {
          id: "reports",
          label: "Export deck",
          href: "#reports",
        },
      ],
    },
  ],
  rightRailTitle: "Review queue",
};
