import { SquareTerminal, type IconComponent } from "@langfuse/icons";
import { SiClaude, SiGithubcopilot, SiOpenai } from "@langfuse/icons/si";

import { GATEWAY_KEY_PLACEHOLDER } from "@/src/features/ai-gateway/constants/agentSetupInstructions";

/** McpHarnessCommand is a terminal command that registers the Langfuse MCP server in one agent harness. */
export type McpHarnessCommand = {
  id: "claude-code" | "codex" | "opencode" | "copilot-cli";
  /** Tab label and icon, matching the AI Gateway's setup tabs. */
  label: string;
  icon: IconComponent;
  /** Product name used in the tab's instruction. */
  product: string;
  /** Command with GATEWAY_KEY_PLACEHOLDER where `secret` goes; key-bearing commands start with a space to stay out of shell history. */
  code: string;
  secret: string;
};

/** shellCommand joins a command's arguments into one bash command, one argument per line, starting with a space so a key in it stays out of shell history. */
export function shellCommand(...lines: string[]): string {
  return ` ${lines.join(" \\\n  ")}`;
}

/** McpCredential is the Authorization scheme and token a key connects to the MCP server with. */
export type McpCredential = { scheme: "Basic" | "Bearer"; token: string };

const serverName = "langfuse";
const codexTokenEnvVar = "LANGFUSE_MCP_TOKEN";

/** buildMcpHarnessCommands lists the MCP setup command for each supported agent harness. */
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
      product: "Claude Code",
      icon: SiClaude,
      code: shellCommand(
        `claude mcp add --transport http ${serverName}`,
        mcpUrl,
        `--header "${header}"`,
      ),
      secret: credential.token,
    },
    {
      id: "codex",
      label: "Codex",
      product: "Codex",
      icon: SiOpenai,
      // Codex sends HTTP MCP credentials only as a bearer token read from an environment variable.
      code: [
        ` export ${codexTokenEnvVar}="${GATEWAY_KEY_PLACEHOLDER}"`,
        shellCommand(
          `codex mcp add ${serverName}`,
          `--url ${mcpUrl}`,
          `--bearer-token-env-var ${codexTokenEnvVar}`,
        ).trimStart(),
      ].join("\n"),
      secret: secretKey,
    },
    {
      id: "opencode",
      label: "OpenCode",
      product: "OpenCode",
      icon: SquareTerminal,
      code: shellCommand(
        `opencode mcp add ${serverName}`,
        `--url ${mcpUrl}`,
        `--header "Authorization=${credential.scheme} ${GATEWAY_KEY_PLACEHOLDER}"`,
      ),
      secret: credential.token,
    },
    {
      id: "copilot-cli",
      label: "GitHub Copilot",
      product: "GitHub Copilot CLI",
      icon: SiGithubcopilot,
      code: shellCommand(
        `copilot mcp add --transport http`,
        `--header "${header}"`,
        serverName,
        mcpUrl,
      ),
      secret: credential.token,
    },
  ];
}
