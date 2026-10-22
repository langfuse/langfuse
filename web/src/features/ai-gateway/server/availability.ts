import { ForbiddenError } from "@langfuse/shared";

import { env } from "@/src/env.mjs";

type GatewayAvailabilityEnvironment = {
  nodeEnv: string | undefined;
  cloudRegion?: string;
  previewPrUrl?: string;
  deployed?: boolean;
  enabledForAllOrganizations?: boolean;
};

const getGatewayAvailabilityEnvironment =
  (): GatewayAvailabilityEnvironment => ({
    nodeEnv: env.NODE_ENV,
    cloudRegion: env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION,
    previewPrUrl: env.NEXT_PUBLIC_PREVIEW_PR_URL,
    deployed: env.LANGFUSE_AI_GATEWAY_DEPLOYED === "true",
    enabledForAllOrganizations: env.LANGFUSE_AI_GATEWAY_ENABLED === "true",
  });

/**
 * Langfuse Cloud (every region, including staging and dev), local development
 * and preview deployments always run a gateway next to Web.
 */
const isGatewayDeployed = (environment: GatewayAvailabilityEnvironment) =>
  environment.deployed === true ||
  Boolean(environment.cloudRegion) ||
  environment.nodeEnv === "development" ||
  environment.previewPrUrl !== undefined;

export const isGatewayEnabledForOrganization = (
  organizationId: string,
  allowedOrganizationIds = env.LANGFUSE_AI_GATEWAY_ORGANIZATION_ID_ALLOWLIST ??
    [],
  environment = getGatewayAvailabilityEnvironment(),
): boolean =>
  isGatewayDeployed(environment) &&
  (environment.enabledForAllOrganizations === true ||
    allowedOrganizationIds.includes(organizationId));

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
