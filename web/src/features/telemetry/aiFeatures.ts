import {
  getInAppAgentModelConfig,
  isInAppAgentInstanceEnabled,
} from "@langfuse/shared/in-app-agent/server/modelProvider";

export type AiFeatureConfigTelemetry = {
  assistantInstanceEnabled: boolean;
  langfuseAiModelConfigured: boolean;
  langfuseAiProvider: string | null;
};

/**
 * Configuration shape of the instance-wide AI features, for the self-hosted
 * telemetry event.
 *
 * Resolved through `getInAppAgentModelConfig` rather than by reading the env
 * vars again, so this cannot disagree with the product about whether the
 * instance is configured. That function owns provider defaulting, the
 * "incomplete provider config counts as unconfigured" rule, and the
 * invalid-Bedrock-region rule.
 *
 * `langfuseAiProvider` is the resolved provider and is null when no usable
 * model is configured, so a provider value always implies a working config.
 * The model id is deliberately not reported: with OpenAI-compatible endpoints
 * supported it can be a private gateway's internal deployment name.
 */
export function getAiFeatureConfigTelemetry(): AiFeatureConfigTelemetry {
  const modelConfig = getInAppAgentModelConfig();

  return {
    assistantInstanceEnabled: isInAppAgentInstanceEnabled(),
    langfuseAiModelConfigured: modelConfig !== undefined,
    langfuseAiProvider: modelConfig?.provider ?? null,
  };
}
