import {
  MousePointer2,
  Pi,
  SquareTerminal,
  type IconComponent,
} from "@langfuse/icons";
import { SiClaude, SiGithubcopilot, SiOpenai } from "@langfuse/icons/si";

import { GATEWAY_KEY_PLACEHOLDER } from "@/src/features/ai-gateway/constants/agentSetupInstructions";

/** McpHarnessCommand is a terminal command that registers the Langfuse MCP server in one agent harness. */
export type McpHarnessCommand = {
  id: "claude-code" | "codex" | "cursor" | "opencode" | "pi" | "copilot-cli";
  /** Tab label and icon, matching the AI Gateway's setup tabs. */
  label: string;
  icon: IconComponent;
  /** Product name used in the tab's instruction. */
  product: string;
  /** Command or config with GATEWAY_KEY_PLACEHOLDER where `secret` goes. */
  code: string;
  /** Highlighting language of `code`. */
  language: "sh" | "json";
  secret: string;
  /** install is a one-click install link and the config file `code` belongs in, for harnesses without a terminal command. */
  install?: { configFile: string; link: () => string };
};

/** shellCommand joins a command's arguments into one bash command, one argument per line. */
export function shellCommand(...lines: string[]): string {
  return lines.join(" \\\n\t");
}

const serverName = "langfuse";
const codexTokenEnvVar = "LANGFUSE_MCP_TOKEN";

/** buildMcpHarnessCommands lists the MCP setup command for each supported agent harness, authenticating with the secret key as a bearer token. */
export function buildMcpHarnessCommands(
  mcpUrl: string,
  secretKey: string,
): McpHarnessCommand[] {
  const header = `Authorization: Bearer ${GATEWAY_KEY_PLACEHOLDER}`;
  const cursorServerConfig = (token: string) => ({
    url: mcpUrl,
    headers: { Authorization: `Bearer ${token}` },
  });
  return [
    {
      id: "claude-code",
      label: "Claude",
      product: "Claude Code",
      icon: SiClaude,
      code: shellCommand(
        `claude mcp add ${serverName}`,
        mcpUrl,
        `--header "${header}"`,
        "--transport http",
      ),
      language: "sh",
      secret: secretKey,
    },
    {
      id: "codex",
      label: "Codex",
      product: "Codex",
      icon: SiOpenai,
      // Codex sends HTTP MCP credentials only as a bearer token read from an environment variable.
      code: [
        `export ${codexTokenEnvVar}="${GATEWAY_KEY_PLACEHOLDER}"`,
        shellCommand(
          `codex mcp add ${serverName}`,
          `--url ${mcpUrl}`,
          `--bearer-token-env-var ${codexTokenEnvVar}`,
        ),
      ].join("\n"),
      language: "sh",
      secret: secretKey,
    },
    {
      id: "cursor",
      label: "Cursor",
      product: "Cursor",
      icon: MousePointer2,
      code: JSON.stringify(
        {
          mcpServers: {
            [serverName]: cursorServerConfig(GATEWAY_KEY_PLACEHOLDER),
          },
        },
        null,
        2,
      ),
      language: "json",
      secret: secretKey,
      install: {
        configFile: "~/.cursor/mcp.json",
        // Cursor's install link takes the server's mcp.json entry, base64 encoded.
        link: () =>
          `cursor://anysphere.cursor-deeplink/mcp/install?name=${serverName}&config=${encodeURIComponent(btoa(JSON.stringify(cursorServerConfig(secretKey))))}`,
      },
    },
    {
      id: "opencode",
      label: "OpenCode",
      product: "OpenCode",
      icon: SquareTerminal,
      code: shellCommand(
        `opencode mcp add ${serverName}`,
        `--url ${mcpUrl}`,
        `--header "Authorization=Bearer ${GATEWAY_KEY_PLACEHOLDER}"`,
      ),
      language: "sh",
      secret: secretKey,
    },
    {
      id: "pi",
      label: "Pi",
      product: "Pi",
      icon: Pi,
      code: shellCommand(
        `pi mcp add ${serverName}`,
        `--url ${mcpUrl}`,
        `--header "Authorization=Bearer ${GATEWAY_KEY_PLACEHOLDER}"`,
      ),
      language: "sh",
      secret: secretKey,
    },
    {
      id: "copilot-cli",
      label: "GitHub Copilot",
      product: "GitHub Copilot CLI",
      icon: SiGithubcopilot,
      code: shellCommand(
        `copilot mcp add ${serverName}`,
        mcpUrl,
        `--header "${header}"`,
        "--transport http",
      ),
      language: "sh",
      secret: secretKey,
    },
  ];
}
