import {
  ArrowUpRight,
  Download,
  FileText,
  FolderClosed,
  House,
  Library,
  Monitor,
  Search,
  Trash2,
  Settings2,
} from "lucide-react";
import type { SpielwieseShellVM } from "../types/shell";

export const spielwieseShellMock: SpielwieseShellVM = {
  productLabel: "Macroextractor",
  workspaceLabel: "Micronutrient tracker",
  team: {
    name: "Rudel",
    plan: "Free plan",
    initials: "RU",
  },
  user: {
    name: "Louis Ville",
    email: "louis@langfuse.dev",
    initials: "LV",
  },
  utilityNavGroups: [
    {
      id: "main",
      items: [
        {
          id: "home",
          label: "Home",
          href: "#home",
          icon: House,
        },
        {
          id: "search",
          label: "Search",
          href: "#search",
          icon: Search,
        },
        {
          id: "library",
          label: "Library",
          href: "#library",
          icon: Library,
        },
        {
          id: "organization-settings",
          label: "Organization settings",
          href: "#organization-settings",
          icon: Settings2,
        },
        {
          id: "documentation",
          label: "Documentation",
          href: "#documentation",
          icon: ArrowUpRight,
        },
      ],
    },
  ],
  sidebarSections: [
    {
      id: "files",
      label: "Files",
      icon: FolderClosed,
      defaultOpen: true,
      items: [
        {
          id: "example-evaluators",
          label: "Example Evaluators",
          href: "#example-evaluators",
          defaultOpen: true,
          children: [
            {
              id: "assistant",
              label: "Micronutrient tracker",
              href: "#assistant",
              icon: FileText,
            },
            {
              id: "vision-agent",
              label: "Vision Agent",
              href: "#vision-agent",
              icon: FileText,
              isDummy: true,
            },
          ],
        },
      ],
    },
  ],
  usage: {
    ctaLabel: "Go Unlimited",
    label: "You are on the free plan",
    limit: 1500,
    used: 878,
  },
  footerTools: [
    {
      id: "desktop",
      label: "Desktop app",
      href: "#desktop",
      icon: Monitor,
    },
    {
      id: "download",
      label: "Download",
      href: "#download",
      icon: Download,
    },
    {
      id: "trash",
      label: "Trash",
      href: "#trash",
      icon: Trash2,
    },
  ],
};
