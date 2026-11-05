import {
  AGENT_SETUP_DOCS_URLS,
  GATEWAY_KEY_PLACEHOLDER,
} from "@/src/features/ai-gateway/constants/agentSetupInstructions";
import type {
  AgentSetupContext,
  AgentSetupInstructions,
} from "@/src/features/ai-gateway/types/agentSetupInstructions";

export function buildCodexInstructions(
  context: AgentSetupContext,
): AgentSetupInstructions {
  return {
    id: "codex",
    label: "Codex",
    heading: "Route Codex through the Langfuse AI Gateway",
    summary:
      "Register the gateway as a Codex model provider so every turn is recorded in Langfuse.",
    docsUrl: AGENT_SETUP_DOCS_URLS.codex,
    warning: context.providers.includes("OPENAI")
      ? undefined
      : "Codex needs an OpenAI provider credential, and none is enabled yet.",
    steps: [
      {
        title: "Export the gateway key",
        description:
          "Codex reads the key from this variable on every start. Add the line to your shell profile, for example ~/.zshrc, so new terminals have it too.",
        language: "sh",
        code: ` export LANGFUSE_GATEWAY_KEY="${GATEWAY_KEY_PLACEHOLDER}"`,
      },
      {
        title: "Add the gateway provider",
        description:
          "Add this to ~/.codex/config.toml ($CODEX_HOME/config.toml if you set CODEX_HOME). Put model_provider next to your other top-level keys, before any [table] section, and the [model_providers.langfuse] table after them.",
        language: "toml",
        code: [
          'model_provider = "langfuse"',
          "",
          "[model_providers.langfuse]",
          'name = "Langfuse AI Gateway"',
          `base_url = "${context.gatewayOrigin}/openai/v1"`,
          'env_key = "LANGFUSE_GATEWAY_KEY"',
          'wire_api = "responses"',
        ].join("\n"),
      },
      {
        title: "Start Codex",
        description: "Each turn appears in Langfuse as one trace.",
        language: "sh",
        code: "codex",
      },
    ],
  };
}
