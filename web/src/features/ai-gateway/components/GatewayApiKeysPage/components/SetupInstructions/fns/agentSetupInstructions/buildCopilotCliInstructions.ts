import {
  AGENT_SETUP_DOCS_URLS,
  GATEWAY_KEY_PLACEHOLDER,
} from "@/src/features/ai-gateway/constants/agentSetupInstructions";
import type {
  AgentSetupContext,
  AgentSetupInstructions,
} from "@/src/features/ai-gateway/types/agentSetupInstructions";
import type { GatewayProvider } from "@/src/features/ai-gateway/types/gatewayProvider";

/** The Anthropic provider type appends `/v1/messages` itself, so its base URL omits `/v1`. */
const COPILOT_PROVIDERS: Record<
  GatewayProvider,
  { path: string; env: string[] }
> = {
  ANTHROPIC: {
    path: "/anthropic",
    env: ['export COPILOT_PROVIDER_TYPE="anthropic"'],
  },
  OPENAI: {
    path: "/openai/v1",
    env: [
      'export COPILOT_PROVIDER_TYPE="openai"',
      'export COPILOT_PROVIDER_WIRE_API="responses"',
    ],
  },
};

export function buildCopilotCliInstructions(
  context: AgentSetupContext,
): AgentSetupInstructions {
  const provider: GatewayProvider = context.providers.includes("ANTHROPIC")
    ? "ANTHROPIC"
    : "OPENAI";
  const { path, env } = COPILOT_PROVIDERS[provider];

  return {
    id: "copilot-cli",
    label: "GitHub Copilot CLI",
    heading: "Route GitHub Copilot CLI through the Langfuse AI Gateway",
    summary:
      "Use the gateway as Copilot CLI's model provider so every model call is recorded in Langfuse.",
    docsUrl: AGENT_SETUP_DOCS_URLS["copilot-cli"],
    warning:
      context.providers.length === 0
        ? "Copilot CLI needs an Anthropic or OpenAI provider credential, and none is enabled yet."
        : undefined,
    steps: [
      {
        title: "Point Copilot CLI at the gateway",
        description:
          "Replace the placeholders with your gateway key and a model from your provider credential. If ~/.copilot/providers.json lists providers, it takes precedence over these variables.",
        language: "sh",
        code: [
          ...env,
          `export COPILOT_PROVIDER_BASE_URL="${context.gatewayOrigin}${path}"`,
          `export COPILOT_PROVIDER_API_KEY="${GATEWAY_KEY_PLACEHOLDER}"`,
          'export COPILOT_MODEL="<model>"',
        ].join("\n"),
      },
      {
        title: "Start Copilot CLI",
        description: "Each model call appears in Langfuse as a trace.",
        language: "sh",
        code: "copilot",
      },
    ],
  };
}
