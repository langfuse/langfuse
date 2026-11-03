import { ForbiddenError, Role } from "@langfuse/shared";

import { env } from "@/src/env.mjs";

type GatewayAvailabilityEnvironment = {
  nodeEnv: string | undefined;
  cloudRegion?: string;
  previewPrUrl?: string;
  deployed?: "true" | "false";
  enabledForAllOrganizations?: "true" | "false";
  writeMode?: (typeof env)["LANGFUSE_MIGRATION_V4_WRITE_MODE"];
};

const getGatewayAvailabilityEnvironment =
  (): GatewayAvailabilityEnvironment => ({
    nodeEnv: env.NODE_ENV,
    cloudRegion: env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION,
    previewPrUrl: env.NEXT_PUBLIC_PREVIEW_PR_URL,
    deployed: env.LANGFUSE_AI_GATEWAY_DEPLOYED,
    enabledForAllOrganizations: env.LANGFUSE_AI_GATEWAY_ENABLED,
    writeMode: env.LANGFUSE_MIGRATION_V4_WRITE_MODE,
  });

const isDevelopmentOrPreview = (environment: GatewayAvailabilityEnvironment) =>
  environment.nodeEnv === "development" ||
  environment.previewPrUrl !== undefined;

/**
 * Langfuse Cloud (every region), local development and preview deployments
 * always run a gateway next to Web.
 */
const isGatewayDeployed = (environment: GatewayAvailabilityEnvironment) =>
  environment.deployed === "true" ||
  Boolean(environment.cloudRegion) ||
  isDevelopmentOrPreview(environment);

/**
 * False only on self-hosted instances without LANGFUSE_AI_GATEWAY_DEPLOYED,
 * which is when the UI points operators to the self-hosting docs.
 */
export const isGatewayDeployedOnInstance = (
  environment = getGatewayAvailabilityEnvironment(),
): boolean => isGatewayDeployed(environment);

/** Unset enables every organization, except on Langfuse Cloud. */
const isEnabledForAllOrganizations = (
  environment: GatewayAvailabilityEnvironment,
) =>
  environment.enabledForAllOrganizations === undefined
    ? !environment.cloudRegion
    : environment.enabledForAllOrganizations === "true";

/**
 * Gateway generations are only attributed to their gateway API key and service
 * in the v4 events table, which the `legacy` write mode never writes.
 */
export const isGatewayEnabledForOrganization = (
  organizationId: string,
  allowedOrganizationIds = env.LANGFUSE_AI_GATEWAY_ORGANIZATION_ID_ALLOWLIST ??
    [],
  environment = getGatewayAvailabilityEnvironment(),
): boolean =>
  environment.writeMode !== "legacy" &&
  isGatewayDeployed(environment) &&
  (isEnabledForAllOrganizations(environment) ||
    isDevelopmentOrPreview(environment) ||
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

/** requireGatewayEnabledForRole rejects granting the AI_GATEWAY role while the AI Gateway is off for the org */
export const requireGatewayEnabledForRole = (
  organizationId: string,
  role: Role,
): void => {
  if (role !== Role.AI_GATEWAY) return;
  requireGatewayEnabledForOrganization(organizationId);
};
