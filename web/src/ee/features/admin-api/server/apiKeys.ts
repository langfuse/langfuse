import { z } from "zod/v4";

import { type SystemRole } from "@langfuse/shared/src/db";

const apiKeyCreationFields = {
  name: z.string().optional(),
  note: z.string().optional(),
  expiresAt: z.iso
    .datetime({ offset: true })
    .transform((value) => new Date(value))
    .refine((value) => value.getTime() > Date.now(), {
      message: "expiresAt must be in the future",
    })
    .nullish(),
};

export const organizationApiKeyCreationSchema = z.object({
  ...apiKeyCreationFields,
  role: z
    .enum(["LEGACY_ORGANIZATION_API_KEY", ""])
    .nullish()
    .transform((role) => role || "LEGACY_ORGANIZATION_API_KEY"),
});

export const projectApiKeyCreationSchema = z.object({
  ...apiKeyCreationFields,
  role: z
    .enum(["LEGACY_PROJECT_API_KEY", ""])
    .nullish()
    .transform((role) => role || "LEGACY_PROJECT_API_KEY"),
  publicKey: z.string().optional(),
  secretKey: z.string().optional(),
});

/** apiKeyToResponse exposes the name alias and a role when exactly one is assigned. */
export function apiKeyToResponse<
  T extends {
    note: string | null;
    roleAssignments: { systemRole: SystemRole }[];
  },
>({ roleAssignments, ...apiKey }: T) {
  return {
    ...apiKey,
    name: apiKey.note,
    role:
      roleAssignments.length === 1
        ? (roleAssignments[0]?.systemRole ?? null)
        : null,
  };
}
