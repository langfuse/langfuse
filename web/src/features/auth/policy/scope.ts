import { type ApiKey } from "@langfuse/shared/src/db";
import { type Plan } from "@langfuse/shared";
import {
  type ApiAccessLevel,
  type ApiAccessScope,
} from "@langfuse/shared/src/server";

import { type PrincipalOrganization } from "./types";

/** ossPlan is the plan an admin-key request runs under; self-host has no cloud plan. */
const ossPlan: Plan = "oss";

/** adminApiKeyId is the audit identifier legacy admin-key auth stamped onto its scope. */
const adminApiKeyId = "ADMIN_API_KEY";

/** adminScope is the ApiAccessScope an admin-key request resolves to for a target project. */
export function adminScope(projectId: string, orgId: string): ApiAccessScope {
  return {
    projectId,
    accessLevel: "project",
    orgId,
    plan: ossPlan,
    rateLimitOverrides: [],
    apiKeyId: adminApiKeyId,
    publicKey: adminApiKeyId,
    isIngestionSuspended: false,
    isInAppAgentKey: false,
  };
}

/** keyScope is the ApiAccessScope an authenticated API key resolves to for a target project. */
export function keyScope(params: {
  apiKey: ApiKey;
  org: PrincipalOrganization;
  presentation: "publicKey" | "privateKey";
  projectId: string | null;
}): ApiAccessScope {
  return {
    projectId: params.projectId,
    accessLevel: accessLevelOf(params.presentation, params.apiKey),
    orgId: params.org.orgId,
    plan: params.org.plan,
    rateLimitOverrides: params.org.rateLimitConfig,
    apiKeyId: params.apiKey.id,
    publicKey: params.apiKey.publicKey,
    isIngestionSuspended: params.org.isIngestionSuspended,
    isInAppAgentKey: params.apiKey.isInAppAgentKey,
  };
}

/** accessLevelOf maps a key presentation to its access level: public keys score-only, org keys organization, else project. */
export function accessLevelOf(
  presentation: "publicKey" | "privateKey",
  apiKey: ApiKey,
): ApiAccessLevel {
  if (presentation === "publicKey") return "scores";
  return apiKey.scope === "ORGANIZATION" ? "organization" : "project";
}
