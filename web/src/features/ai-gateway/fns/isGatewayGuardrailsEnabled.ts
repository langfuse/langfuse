import {
  type GatewayDeploymentEnvironment,
  isDevelopmentOrPreview,
} from "@/src/features/ai-gateway/fns/isDevelopmentOrPreview";

/**
 * Guardrails management UI and tRPC endpoints are enabled only in local
 * development, PR previews, and staging; Cloud production and self-hosted stay off.
 */
export function isGatewayGuardrailsEnabled(
  environment: GatewayDeploymentEnvironment,
) {
  return (
    isDevelopmentOrPreview(environment) || environment.cloudRegion === "STAGING"
  );
}
