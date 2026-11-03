import { AGENT_SETUP_DOCS_URLS } from "@/src/features/ai-gateway/constants/agentSetupInstructions";
import type {
  AgentSetupContext,
  AgentSetupInstructions,
} from "@/src/features/ai-gateway/types/agentSetupInstructions";

export function buildClaudeDesktopInstructions(
  context: AgentSetupContext,
): AgentSetupInstructions {
  return {
    id: "claude-desktop",
    label: "Claude Desktop",
    heading: "Route Claude Desktop through the Langfuse AI Gateway",
    summary:
      "Configure third-party inference in the Claude Desktop app so every model call is recorded in Langfuse.",
    docsUrl: AGENT_SETUP_DOCS_URLS["claude-desktop"],
    warning: context.providers.includes("ANTHROPIC")
      ? undefined
      : "Claude Desktop needs an Anthropic provider credential, and none is enabled yet.",
    steps: [
      {
        title: "Open the third-party inference settings",
        description:
          "Open Developer → Configure Third-Party Inference and set Inference provider to Gateway. If the Developer menu is missing, enable Developer Mode under Help → Troubleshooting.",
      },
      {
        title: "Optional: keep your claude.ai chats",
        description:
          "Gateway mode uses a separate profile. To keep your existing chats and sessions, turn on Claude.ai data import under Capabilities. After restarting, use Settings → Import & export.",
        link: {
          label: "Import and export docs",
          href: "https://claude.com/docs/third-party/claude-desktop/import",
        },
      },
      {
        title: "Set the gateway base URL",
        description: "Paste this URL exactly as shown.",
        language: "text",
        code: `${context.gatewayOrigin}/anthropic`,
      },
      {
        title: "Add your gateway key",
        description:
          "Set Credential kind to Static API key, paste your gateway key as Gateway API key, and select Bearer as the auth scheme.",
      },
      {
        title: "Allow egress hosts",
        description:
          "Under Capabilities → General restrictions, we recommend adding \"*\" to Allowed egress hosts. Otherwise, Claude can't reach websites or services outside the gateway, such as GitHub, and won't ask for permission.",
      },
      {
        title: "Apply and restart",
        description:
          "Test the connection, select Apply Changes, then Save & Restart. Start a new session so the egress settings apply.",
      },
    ],
  };
}
