import { ForbiddenError } from "@langfuse/shared";
import type { ApiAccessScope } from "@langfuse/shared/src/server";

import { findSessionProjectOrganization } from "./sessionAccessors";
import { type PolicySession } from "./sessionCallback";

/** getInAppAgentApiAccessScope builds the org-scoped rate-limit scope for an in-app agent request on projectId. */
export function getInAppAgentApiAccessScope(
  session: PolicySession,
  projectId: string,
): ApiAccessScope {
  const organization = findSessionProjectOrganization(session, projectId);
  if (!organization) {
    throw new ForbiddenError("User is not a member of this project");
  }
  return {
    orgId: organization.id,
    plan: organization.plan,
    projectId,
    accessLevel: "project",
    rateLimitOverrides: organization.cloudConfig?.rateLimitOverrides ?? [],
    apiKeyId: "in-app-agent-session",
    publicKey: "in-app-agent-session",
    isIngestionSuspended: false,
    accessAuditLogEnabled: null,
  };
}
