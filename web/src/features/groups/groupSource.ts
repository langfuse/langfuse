import { RefreshCw, UserRound } from "@langfuse/icons";

type GroupSourceValue = "SCIM" | "MANUAL";

export const GROUP_SOURCE_DISPLAY = {
  SCIM: {
    label: "SCIM",
    icon: RefreshCw,
    description:
      "Synced from your identity provider. Its name and members are managed there.",
  },
  MANUAL: {
    label: "Langfuse",
    icon: UserRound,
    description:
      "Created by an admin in Langfuse. Your identity provider cannot see or change it.",
  },
} as const satisfies Record<
  GroupSourceValue,
  { label: string; icon: typeof RefreshCw; description: string }
>;

export const isScimManaged = (group: { source: string }) =>
  group.source === "SCIM";

export const SCIM_SYNCED_LABEL = "Synced from identity provider";

export const SCIM_LOCK_LABEL =
  "Synced from your identity provider. Its name and members are managed there; you can still set its roles here.";
