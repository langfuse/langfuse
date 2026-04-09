import {
  CircleCheckBig,
  FileStack,
  FolderClosed,
  LayoutList,
  Paperclip,
  Search,
} from "lucide-react";
import type { SpielwieseShellVM } from "../types/shell";

export const spielwieseShellMock: SpielwieseShellVM = {
  productLabel: "Macroextractor",
  workspaceLabel: "Assistant",
  team: {
    name: "Macroextractor",
    plan: "Just now",
    initials: "ME",
  },
  user: {
    name: "Louis Ville",
    email: "louis@langfuse.dev",
    initials: "LV",
  },
  primaryNav: [
    {
      id: "outline",
      label: "Outline",
      href: "#outline",
      icon: LayoutList,
      isActive: true,
    },
    {
      id: "review",
      label: "Review",
      href: "#review",
      icon: CircleCheckBig,
    },
    {
      id: "attach",
      label: "Attach",
      href: "#attach",
      icon: Paperclip,
    },
    {
      id: "search",
      label: "Search",
      href: "#search",
      icon: Search,
    },
  ],
  secondaryNav: [
    {
      id: "folder",
      label: "Folders",
      href: "#folders",
      icon: FolderClosed,
    },
    {
      id: "files",
      label: "Files",
      href: "#files",
      icon: FileStack,
    },
  ],
  favorites: [],
  workspaces: [
    {
      id: "macroextractor",
      label: "Macroextractor",
      emoji: "•",
      defaultOpen: true,
      pages: [
        {
          id: "assistant",
          label: "Assistant",
          href: "#assistant",
          isActive: true,
        },
        {
          id: "vision-agent",
          label: "Step 1 — Vision Agent",
          href: "#vision-agent",
        },
        {
          id: "nutrition-agent",
          label: "Step 2 — Nutrition Agent",
          href: "#nutrition-agent",
        },
      ],
    },
  ],
};
