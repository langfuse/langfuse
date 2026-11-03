import {
  AGENT_SETUP_DOCS_URLS,
  GATEWAY_KEY_PLACEHOLDER,
} from "@/src/features/ai-gateway/constants/agentSetupInstructions";
import type {
  AgentSetupContext,
  AgentSetupInstructions,
  AgentSetupStep,
} from "@/src/features/ai-gateway/types/agentSetupInstructions";
import type { GatewayProvider } from "@/src/features/ai-gateway/types/gatewayProvider";

const LIST_MODELS_STEPS: Record<GatewayProvider, AgentSetupStep> = {
  OPENAI: {
    title: "List models through the OpenAI route",
    description:
      "A model list means the gateway key and the provider credential work.",
    language: "sh",
    code: [
      'curl -s "$LANGFUSE_GATEWAY_HOST/openai/v1/models" \\',
      '  -H "Authorization: Bearer $LANGFUSE_GATEWAY_KEY"',
    ].join("\n"),
  },
  ANTHROPIC: {
    title: "List models through the Anthropic route",
    description:
      "A model list means the gateway key and the provider credential work.",
    language: "sh",
    code: [
      'curl -s "$LANGFUSE_GATEWAY_HOST/anthropic/v1/models?limit=1000" \\',
      '  -H "x-api-key: $LANGFUSE_GATEWAY_KEY" \\',
      '  -H "anthropic-version: 2023-06-01"',
    ].join("\n"),
  },
};

export function buildApiInstructions(
  context: AgentSetupContext,
): AgentSetupInstructions {
  const providers: GatewayProvider[] =
    context.providers.length > 0 ? context.providers : ["OPENAI", "ANTHROPIC"];

  return {
    id: "api",
    label: "API",
    heading: "Call the Langfuse AI Gateway over HTTP",
    summary:
      "Export the gateway host and key, then list the models through the provider routes to check the setup.",
    docsUrl: AGENT_SETUP_DOCS_URLS.api,
    warning:
      context.providers.length === 0
        ? "No provider credential is enabled yet. Requests fail until an organization admin adds one."
        : undefined,
    steps: [
      {
        title: "Export the gateway host and key",
        description: "Replace the placeholder with your gateway key.",
        language: "sh",
        code: [
          `export LANGFUSE_GATEWAY_HOST="${context.gatewayOrigin}"`,
          `export LANGFUSE_GATEWAY_KEY="${GATEWAY_KEY_PLACEHOLDER}"`,
        ].join("\n"),
      },
      ...providers.map((provider) => LIST_MODELS_STEPS[provider]),
    ],
  };
}
