import {
  CalendarDays,
  CircleCheckBig,
  Cloud,
  Download,
  FileStack,
  FolderClosed,
  Inbox,
  Monitor,
  Plus,
  Search,
  Star,
  Tag,
  Trash2,
  Users,
} from "lucide-react";
import type { SpielwieseShellVM } from "../types/shell";

export const spielwieseShellMock: SpielwieseShellVM = {
  productLabel: "Macroextractor",
  workspaceLabel: "Assistant",
  team: {
    name: "My Space",
    plan: "Free plan",
    initials: "MS",
  },
  user: {
    name: "Louis Ville",
    email: "louis@langfuse.dev",
    initials: "LV",
  },
  utilityNavGroups: [
    {
      id: "workspace",
      items: [
        {
          id: "all-docs",
          label: "All Docs",
          href: "#all-docs",
          icon: FileStack,
          count: "12",
        },
        {
          id: "tasks",
          label: "Tasks",
          href: "#tasks",
          icon: CircleCheckBig,
          actionIcon: Plus,
        },
        {
          id: "calendar",
          label: "Calendar",
          href: "#calendar",
          icon: CalendarDays,
          actionIcon: Search,
        },
      ],
    },
    {
      id: "explore",
      items: [
        {
          id: "imagine",
          label: "Imagine",
          href: "#vision-agent",
          icon: Cloud,
        },
        {
          id: "shared-with-me",
          label: "Shared With Me",
          href: "#shared-with-me",
          icon: Users,
          count: "0",
        },
      ],
    },
  ],
  sidebarSections: [
    {
      id: "starred",
      label: "Starred",
      icon: Star,
      actionIcon: Plus,
      defaultOpen: true,
      emptyState: "Star Docs to keep them close",
      items: [],
    },
    {
      id: "folders",
      label: "Folders",
      icon: FolderClosed,
      actionIcon: Plus,
      defaultOpen: true,
      items: [
        {
          id: "how-to-use-craft",
          label: "How to use Craft",
          href: "#welcome-pack",
          count: "3",
          defaultOpen: true,
          emoji: "👋",
          children: [
            {
              id: "workspace-rules",
              label: "Workspace Rules",
              href: "#workspace-rules",
            },
            {
              id: "getting-started",
              label: "Getting Started",
              href: "#getting-started",
            },
            {
              id: "craft-basics",
              label: "Craft Basics",
              href: "#craft-basics",
            },
          ],
        },
        {
          id: "unsorted",
          label: "Unsorted",
          href: "#search",
          count: "9",
          defaultOpen: true,
          icon: Inbox,
          children: [
            {
              id: "assistant",
              label: "Assistant",
              href: "#assistant",
            },
            {
              id: "vision-agent",
              label: "Vision Agent",
              href: "#vision-agent",
            },
            {
              id: "search",
              label: "Search",
              href: "#search",
            },
            {
              id: "nutrition-agent",
              label: "Nutrition Agent",
              href: "#nutrition-agent",
            },
            {
              id: "my-post",
              label: "My Post",
              href: "#my-post",
            },
            {
              id: "open-questions",
              label: "Open Questions Numia",
              href: "#open-questions",
            },
            {
              id: "philips",
              label: "philips",
              href: "#philips",
            },
            {
              id: "prompt-eng",
              label: "prompt eng",
              href: "#prompt-eng",
            },
            {
              id: "untitled-document",
              label: "Untitled Document",
              href: "#untitled-document",
            },
          ],
        },
      ],
    },
    {
      id: "tags",
      label: "Tags",
      icon: Tag,
      actionIcon: Plus,
      defaultOpen: true,
      emptyState: "Pin your key tags for quick access",
      items: [],
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
