import { z } from "zod/v4";

import {
  apiKeyRolesForScope,
  legacyApiKeyRoleForScope,
} from "@langfuse/shared/rbac";

import { env } from "@/src/env.mjs";

export function apiKeyCreationRoleSchema(scope: "project" | "organization") {
  return z
    .enum(apiKeyRolesForScope(scope))
    .nullish()
    .refine(
      (role) =>
        role == null ||
        (env.API_AUTH_MIGRATION === "enforce" &&
          (scope === "project"
            ? env.API_KEY_PROJECT_ROLES_ENABLE
            : env.API_KEY_ORG_ROLES_ENABLE) === "true"),
      { message: "API key role selection is not enabled" },
    )
    .transform((role) => role ?? legacyApiKeyRoleForScope(scope));
}
