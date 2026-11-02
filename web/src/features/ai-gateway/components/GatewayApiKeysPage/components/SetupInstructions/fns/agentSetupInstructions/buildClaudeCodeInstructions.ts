import {
  AGENT_SETUP_DOCS_URLS,
  GATEWAY_KEY_PLACEHOLDER,
} from "@/src/features/ai-gateway/constants/agentSetupInstructions";
import type {
  AgentSetupContext,
  AgentSetupInstructions,
} from "@/src/features/ai-gateway/types/agentSetupInstructions";

export function buildClaudeCodeInstructions(
  context: AgentSetupContext,
): AgentSetupInstructions {
  return {
    id: "claude-code",
    label: "Claude Code",
    heading: "Route Claude Code through the Langfuse AI Gateway",
    summary:
      "Point the Claude Code CLI at the gateway so every model call is recorded in Langfuse.",
    docsUrl: AGENT_SETUP_DOCS_URLS["claude-code"],
    warning: context.providers.includes("ANTHROPIC")
      ? undefined
      : "Claude Code needs an Anthropic provider credential, and none is enabled yet.",
    steps: [
      {
        title: "Log out of any existing session",
        description: "An existing Claude login sends conflicting credentials.",
        language: "sh",
        code: "claude /logout",
      },
      {
        title: "Point Claude Code at the gateway",
        description: "Leave ANTHROPIC_API_KEY unset.",
        language: "sh",
        code: [
          `export ANTHROPIC_BASE_URL="${context.gatewayOrigin}/anthropic"`,
          `export ANTHROPIC_AUTH_TOKEN="${GATEWAY_KEY_PLACEHOLDER}"`,
          "unset ANTHROPIC_API_KEY",
        ].join("\n"),
      },
      {
        title: "Start Claude Code",
        description: "Your sessions appear in Langfuse under Sessions.",
        language: "sh",
        code: "claude",
      },
    ],
  };
}
