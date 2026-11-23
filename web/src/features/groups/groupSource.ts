import { Cog, RefreshCw, UserRound } from "@langfuse/icons";

type GroupSourceValue = "SCIM" | "MANUAL" | "SYSTEM";

export const GROUP_SOURCE_DISPLAY = {
  SCIM: {
    label: "SCIM",
    icon: RefreshCw,
    summary: "Synced from identity provider",
    description:
      "Synced from your identity provider. Its name and members are managed there.",
  },
  MANUAL: {
    label: "Langfuse",
    icon: UserRound,
    summary: "Created in Langfuse",
    description:
      "Created by an admin in Langfuse. Your identity provider cannot see or change it.",
  },
  SYSTEM: {
    label: "System",
    icon: Cog,
    summary: "Managed by Langfuse",
    description: "Managed by Langfuse.",
  },
} as const satisfies Record<
  GroupSourceValue,
  { label: string; icon: typeof Cog; summary: string; description: string }
>;

export const isScimManaged = (group: { source: string }) =>
  group.source === "SCIM";

export const SCIM_LOCK_LABEL =
  "Synced from your identity provider. Its name and members are managed there; you can still set its roles here.";
