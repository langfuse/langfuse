import { z } from "zod/v4";

import { type SystemRole } from "@langfuse/shared/src/db";

export const apiKeyCreationSchema = z.object({
  name: z.string().optional(),
  note: z.string().optional(),
  expiresAt: z.iso
    .datetime({ offset: true })
    .transform((value) => new Date(value))
    .refine((value) => value.getTime() > Date.now(), {
      message: "expiresAt must be in the future",
    })
    .nullish(),
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
