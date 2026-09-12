import { ForbiddenError } from "@langfuse/shared";

import { env } from "@/src/env.mjs";

type GatewayAvailabilityEnvironment = {
  nodeEnv: string | undefined;
};

const getGatewayAvailabilityEnvironment =
  (): GatewayAvailabilityEnvironment => ({
    nodeEnv: env.NODE_ENV,
  });

export const isGatewayEnabledForOrganization = (
  organizationId: string,
  allowedOrganizationIds = env.LANGFUSE_AI_GATEWAY_ORGANIZATION_ID_ALLOWLIST ??
    [],
  environment = getGatewayAvailabilityEnvironment(),
): boolean =>
  environment.nodeEnv === "development" ||
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
