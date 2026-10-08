import { z } from "zod/v4";

import { type SystemRole } from "@langfuse/shared/src/db";

import { apiKeyCreationRoleSchema } from "@/src/features/public-api/server/apiKeyCreationRoleSchema";

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
  role: apiKeyCreationRoleSchema("organization"),
});

export const projectApiKeyCreationSchema = z.object({
  ...apiKeyCreationFields,
  role: apiKeyCreationRoleSchema("project"),
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
