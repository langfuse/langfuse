import { Cog, RefreshCw, UserRound } from "@langfuse/icons";

type GroupSourceValue = "SCIM" | "MANUAL" | "SYSTEM";

// One place for how a group's origin is shown, so SCIM-synced, user-created
// and Langfuse-managed groups never look alike.
export const GROUP_SOURCE_DISPLAY = {
  SCIM: {
    badge: "SCIM",
    color: "blue",
    icon: RefreshCw,
    description:
      "Synced from your identity provider through SCIM. Changes made here can be overwritten by the next sync.",
  },
  MANUAL: {
    badge: "User-created",
    color: "green",
    icon: UserRound,
    description:
      "Created by an admin in Langfuse. Your identity provider cannot see or change it.",
  },
  SYSTEM: {
    badge: "System",
    color: "violet",
    icon: Cog,
    description: "Managed by Langfuse.",
  },
} as const satisfies Record<
  GroupSourceValue,
  {
    badge: string;
    color: "blue" | "green" | "violet";
    icon: typeof Cog;
    description: string;
  }
>;
