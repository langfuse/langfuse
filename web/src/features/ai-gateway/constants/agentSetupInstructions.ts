export const GATEWAY_KEY_PLACEHOLDER = "<your-gateway-key>";
export const GATEWAY_USER_ID_PLACEHOLDER = "<you>@example.com";

const GATEWAY_DOCS_URL = "https://langfuse.com/docs/ai-gateway";

export const AGENT_SETUP_DOCS_URLS = {
  api: `${GATEWAY_DOCS_URL}/get-started`,
  "claude-code": `${GATEWAY_DOCS_URL}/coding-agents/claude-code`,
  codex: `${GATEWAY_DOCS_URL}/coding-agents/codex`,
  opencode: `${GATEWAY_DOCS_URL}/coding-agents/opencode`,
} as const;
