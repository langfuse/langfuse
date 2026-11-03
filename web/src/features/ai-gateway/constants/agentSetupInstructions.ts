import {
  GATEWAY_CODING_AGENTS_DOCS_URL,
  GATEWAY_FIRST_REQUEST_DOCS_URL,
} from "./gatewayDocsUrls";

export const GATEWAY_KEY_PLACEHOLDER = "<your-gateway-key>";

export const AGENT_SETUP_DOCS_URLS = {
  api: GATEWAY_FIRST_REQUEST_DOCS_URL,
  "claude-desktop": `${GATEWAY_CODING_AGENTS_DOCS_URL}/claude-code#claude-desktop`,
  "claude-code": `${GATEWAY_CODING_AGENTS_DOCS_URL}/claude-code#claude-code-cli`,
  codex: `${GATEWAY_CODING_AGENTS_DOCS_URL}/codex`,
  opencode: `${GATEWAY_CODING_AGENTS_DOCS_URL}/opencode`,
  "copilot-cli": `${GATEWAY_CODING_AGENTS_DOCS_URL}/github-copilot#cli`,
  "copilot-desktop": `${GATEWAY_CODING_AGENTS_DOCS_URL}/github-copilot#app`,
} as const;
