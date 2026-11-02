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
        title: "Store the key in Codex's .env",
        description:
          "Codex loads this file every time it starts. Replace the placeholder with your gateway key.",
        language: "sh",
        code: [
          'CODEX_DIR="${CODEX_HOME:-$HOME/.codex}"',
          'mkdir -p -m 700 "$CODEX_DIR"',
          'touch "$CODEX_DIR/.env" && chmod 600 "$CODEX_DIR/.env"',
          `cat >> "$CODEX_DIR/.env" <<'EOF'`,
          `LANGFUSE_GATEWAY_KEY=${GATEWAY_KEY_PLACEHOLDER}`,
          "EOF",
        ].join("\n"),
      },
      {
        title: "Add the gateway provider",
        description:
          "Add this to the top of config.toml in the same directory ($CODEX_HOME, or ~/.codex by default), before any [table] section, so model_provider stays a top-level key.",
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
