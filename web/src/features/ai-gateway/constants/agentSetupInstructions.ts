import { GATEWAY_DOCS_URL } from "./gatewayDocsUrls";

export const GATEWAY_KEY_PLACEHOLDER = "<your-gateway-key>";

export const AGENT_SETUP_DOCS_URLS = {
  api: `${GATEWAY_DOCS_URL}/get-started`,
  "claude-desktop": `${GATEWAY_DOCS_URL}/coding-agents/claude-code#claude-desktop`,
  "claude-code": `${GATEWAY_DOCS_URL}/coding-agents/claude-code#claude-code-cli`,
  codex: `${GATEWAY_DOCS_URL}/coding-agents/codex`,
  opencode: `${GATEWAY_DOCS_URL}/coding-agents/opencode`,
} as const;
