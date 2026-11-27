import { SquareTerminal, type IconComponent } from "@langfuse/icons";
import { SiClaude, SiGithubcopilot, SiOpenai } from "@langfuse/icons/si";

import { GATEWAY_KEY_PLACEHOLDER } from "@/src/features/ai-gateway/constants/agentSetupInstructions";

/** McpHarnessCommand is a terminal command that registers the Langfuse MCP server in one agent harness. */
export type McpHarnessCommand = {
  id: "claude-code" | "codex" | "opencode" | "copilot-cli";
  /** Tab label and icon, matching the AI Gateway's setup tabs. */
  label: string;
  icon: IconComponent;
  description: string;
  /** Command with GATEWAY_KEY_PLACEHOLDER where `secret` goes; key-bearing lines start with a space to stay out of shell history. */
  code: string;
  secret: string;
};

/** McpCredential is the Authorization scheme and token a key connects to the MCP server with. */
export type McpCredential = { scheme: "Basic" | "Bearer"; token: string };

const serverName = "langfuse";
const codexTokenEnvVar = "LANGFUSE_MCP_TOKEN";

/** buildMcpHarnessCommands lists the one-line MCP setup command for each supported agent harness. */
export function buildMcpHarnessCommands(
  mcpUrl: string,
  credential: McpCredential,
  secretKey: string,
): McpHarnessCommand[] {
  const header = `Authorization: ${credential.scheme} ${GATEWAY_KEY_PLACEHOLDER}`;
  return [
    {
      id: "claude-code",
      label: "Claude",
      icon: SiClaude,
      description:
        "Run this in your terminal to add the Langfuse MCP server to Claude Code.",
      code: ` claude mcp add --transport http ${serverName} ${mcpUrl} --header "${header}"`,
      secret: credential.token,
    },
    {
      id: "codex",
      label: "Codex",
      icon: SiOpenai,
      // Codex sends HTTP MCP credentials only as a bearer token read from an environment variable.
      description: `Codex reads the key from ${codexTokenEnvVar} when it starts, so export it in the shell you run Codex from.`,
      code: [
        ` export ${codexTokenEnvVar}="${GATEWAY_KEY_PLACEHOLDER}"`,
        `codex mcp add ${serverName} --url ${mcpUrl} --bearer-token-env-var ${codexTokenEnvVar}`,
      ].join("\n"),
      secret: secretKey,
    },
    {
      id: "opencode",
      label: "OpenCode",
      icon: SquareTerminal,
      description:
        "Run this in your terminal to add the Langfuse MCP server to OpenCode.",
      code: ` opencode mcp add ${serverName} --url ${mcpUrl} --header "Authorization=${credential.scheme} ${GATEWAY_KEY_PLACEHOLDER}"`,
      secret: credential.token,
    },
    {
      id: "copilot-cli",
      label: "GitHub Copilot",
      icon: SiGithubcopilot,
      description:
        "Run this in your terminal to add the Langfuse MCP server to GitHub Copilot CLI.",
      code: ` copilot mcp add --transport http --header "${header}" ${serverName} ${mcpUrl}`,
      secret: credential.token,
    },
  ];
}
