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
          shortcut: "H",
        },
        {
          id: "search",
          label: "Search",
          href: "#search",
          icon: Search,
          shortcut: "F",
        },
        {
          id: "library",
          label: "Library",
          href: "#library",
          icon: Library,
          shortcut: "L",
        },
        {
          id: "organization-settings",
          label: "Organization settings",
          href: "#organization-settings",
          icon: Settings2,
          shortcut: "O",
        },
        {
          id: "documentation",
          label: "Documentation",
          href: "#documentation",
          icon: ArrowUpRight,
          shortcut: "D",
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
          shortcut: "E",
          defaultOpen: true,
          children: [
            {
              id: "assistant",
              label: "Micronutrient tracker",
              href: "#assistant",
              icon: FileText,
              shortcut: "M",
            },
            {
              id: "vision-agent",
              label: "Vision Agent",
              href: "#vision-agent",
              icon: FileText,
              shortcut: "V",
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
