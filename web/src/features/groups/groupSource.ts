import { RefreshCw } from "@langfuse/icons";

type GroupSourceValue = "SCIM" | "MANUAL";

export const GROUP_SOURCE_DISPLAY = {
  SCIM: {
    label: "SCIM",
    icon: RefreshCw,
    description:
      "Synced from your identity provider. Its name and members are managed there.",
  },
  MANUAL: {
    label: "Manual",
    description:
      "Created by an admin in Langfuse. Your identity provider cannot see or change it.",
  },
} as const satisfies Record<
  GroupSourceValue,
  { label: string; icon?: typeof RefreshCw; description: string }
>;

export const isScimManaged = (group: { source: string }) =>
  group.source === "SCIM";

export const SCIM_MANAGED_LABEL = "Members managed in your identity provider";

export const NO_GROUP_EDIT_REASON =
  "You do not have permission to manage groups";
