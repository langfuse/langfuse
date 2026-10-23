import { ForbiddenError, Role } from "@langfuse/shared";

import { env } from "@/src/env.mjs";

type GatewayAvailabilityEnvironment = {
  nodeEnv: string | undefined;
  previewPrUrl?: string;
  enabledForAllOrganizations?: boolean;
};

const getGatewayAvailabilityEnvironment =
  (): GatewayAvailabilityEnvironment => ({
    nodeEnv: env.NODE_ENV,
    previewPrUrl: env.NEXT_PUBLIC_PREVIEW_PR_URL,
    enabledForAllOrganizations: env.LANGFUSE_AI_GATEWAY_ENABLED === "true",
  });

export const isGatewayEnabledForOrganization = (
  organizationId: string,
  allowedOrganizationIds = env.LANGFUSE_AI_GATEWAY_ORGANIZATION_ID_ALLOWLIST ??
    [],
  environment = getGatewayAvailabilityEnvironment(),
): boolean =>
  environment.enabledForAllOrganizations === true ||
  environment.nodeEnv === "development" ||
  environment.previewPrUrl !== undefined ||
  allowedOrganizationIds.includes(organizationId);

export const requireGatewayEnabledForOrganization = (
  organizationId: string,
  allowedOrganizationIds = env.LANGFUSE_AI_GATEWAY_ORGANIZATION_ID_ALLOWLIST ??
    [],
  environment = getGatewayAvailabilityEnvironment(),
): void => {
  if (
    !isGatewayEnabledForOrganization(
      organizationId,
      allowedOrganizationIds,
      environment,
    )
  ) {
    throw new ForbiddenError("AI Gateway is not enabled for this organization");
  }
};

/** requireGatewayEnabledForRole rejects granting the AI_GATEWAY role while the AI Gateway is off for the org */
export const requireGatewayEnabledForRole = (
  organizationId: string,
  role: Role,
): void => {
  if (role !== Role.AI_GATEWAY) return;
  requireGatewayEnabledForOrganization(organizationId);
};
