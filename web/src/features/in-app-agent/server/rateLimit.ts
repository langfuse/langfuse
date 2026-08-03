import { type Session } from "next-auth";

import {
  BaseError,
  CloudConfigSchema,
  ForbiddenError,
  type RateLimitResult,
} from "@langfuse/shared";
import type { ApiAccessScope } from "@langfuse/shared/src/server";

import { getOrganizationPlanServerSide } from "@/src/features/entitlements/server/getPlan";
import { RateLimitService } from "@/src/features/public-api/server/RateLimitService";

type SessionUser = NonNullable<Session["user"]>;

// Follow the effective organization limit (including overrides) while
// reserving at least half of the shared allowance for other users.
const IN_APP_AGENT_USER_RATE_LIMIT_MULTIPLIER = 0.5;

/**
 * Build the organization rate-limit scope for an in-app agent request.
 *
 * Shared by the foreground route and the background `startRun` mutation so a
 * user cannot bypass the limits by submitting through the other path.
 */
export function getInAppAgentApiAccessScope(
  user: SessionUser,
  projectId: string,
  projectOrganization: {
    id: string;
    cloudConfig: unknown;
  },
): ApiAccessScope {
  const organization = user.organizations.find((org) =>
    org.projects.some((project) => project.id === projectId),
  );

  if (!organization) {
    if (user.admin === true) {
      const cloudConfig = projectOrganization.cloudConfig
        ? CloudConfigSchema.parse(projectOrganization.cloudConfig)
        : undefined;

      return {
        orgId: projectOrganization.id,
        plan: getOrganizationPlanServerSide(cloudConfig),
        projectId,
        accessLevel: "project",
        rateLimitOverrides: cloudConfig?.rateLimitOverrides ?? [],
        apiKeyId: "in-app-agent-session",
        publicKey: "in-app-agent-session",
        isIngestionSuspended: false,
      };
    }

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
  };
}

export async function checkInAppAgentRateLimit(
  scope: ApiAccessScope,
  userId: string,
  resource: Parameters<RateLimitService["rateLimitRequest"]>[1],
): Promise<RateLimitResult | undefined> {
  const rateLimitService = RateLimitService.getInstance();

  // Check the user bucket first so repeated rejected requests from one user do
  // not consume the shared organization allowance.
  const userRateLimit = await rateLimitService.rateLimitRequest(
    scope,
    resource,
    {
      type: "user",
      userId,
      pointsMultiplier: IN_APP_AGENT_USER_RATE_LIMIT_MULTIPLIER,
    },
  );

  if (userRateLimit.isRateLimited()) {
    return userRateLimit.res ?? undefined;
  }

  const organizationRateLimit = await rateLimitService.rateLimitRequest(
    scope,
    resource,
  );

  return organizationRateLimit.isRateLimited()
    ? (organizationRateLimit.res ?? undefined)
    : undefined;
}

/** tRPC-shaped variant; BaseErrors bubble to the tRPC error middleware. */
export async function assertInAppAgentRateLimit(
  scope: ApiAccessScope,
  userId: string,
  resource: Parameters<RateLimitService["rateLimitRequest"]>[1],
): Promise<void> {
  const rateLimitRes = await checkInAppAgentRateLimit(scope, userId, resource);

  if (!rateLimitRes) {
    return;
  }

  throw new BaseError(
    "TooManyRequestsError",
    429,
    `Too many assistant requests. Please retry in ${Math.ceil(
      rateLimitRes.msBeforeNext / 1_000,
    )} seconds.`,
    true,
  );
}
