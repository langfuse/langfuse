import { ForbiddenError } from "@langfuse/shared";

import { env } from "@/src/env.mjs";

type GatewayAvailabilityEnvironment = {
  nodeEnv: string | undefined;
  previewPrUrl?: string;
};

const getGatewayAvailabilityEnvironment =
  (): GatewayAvailabilityEnvironment => ({
    nodeEnv: env.NODE_ENV,
    previewPrUrl: env.NEXT_PUBLIC_PREVIEW_PR_URL,
  });

export const isGatewayEnabledForOrganization = (
  organizationId: string,
  allowedOrganizationIds = env.LANGFUSE_AI_GATEWAY_ORGANIZATION_ID_ALLOWLIST ??
    [],
  environment = getGatewayAvailabilityEnvironment(),
): boolean =>
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
