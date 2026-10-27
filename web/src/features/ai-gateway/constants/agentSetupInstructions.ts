import { GATEWAY_DOCS_URL } from "./gatewayDocsUrls";

export const GATEWAY_KEY_PLACEHOLDER = "<your-gateway-key>";
export const GATEWAY_USER_ID_PLACEHOLDER = "<you>@example.com";

export const AGENT_SETUP_DOCS_URLS = {
  api: `${GATEWAY_DOCS_URL}/get-started`,
  "claude-desktop": `${GATEWAY_DOCS_URL}/coding-agents/claude-code#claude-desktop`,
  "claude-code": `${GATEWAY_DOCS_URL}/coding-agents/claude-code#claude-code-cli`,
  codex: `${GATEWAY_DOCS_URL}/coding-agents/codex`,
  opencode: `${GATEWAY_DOCS_URL}/coding-agents/opencode`,
} as const;
