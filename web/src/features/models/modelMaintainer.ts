import type { ModelScope } from "@langfuse/shared";

export const modelMaintainerByScope = {
  LANGFUSE: "Langfuse",
  ORGANIZATION: "Organization",
  PROJECT: "User",
} as const satisfies Record<ModelScope, string>;

export type ModelMaintainer = (typeof modelMaintainerByScope)[ModelScope];

export const modelMaintainerBadgeVariant = {
  Langfuse: "teal",
  Organization: "violet",
  User: "blue",
} as const satisfies Record<ModelMaintainer, string>;
