import {
  GATEWAY_DEVELOPER_TOOLS_DOCS_URL,
  GATEWAY_FIRST_REQUEST_DOCS_URL,
} from "./gatewayDocsUrls";

export const GATEWAY_KEY_PLACEHOLDER = "<your-gateway-key>";

export const AGENT_SETUP_DOCS_URLS = {
  api: GATEWAY_FIRST_REQUEST_DOCS_URL,
  "claude-desktop": `${GATEWAY_DEVELOPER_TOOLS_DOCS_URL}/claude-code-gateway#claude-desktop`,
  "claude-code": `${GATEWAY_DEVELOPER_TOOLS_DOCS_URL}/claude-code-gateway#claude-code-cli`,
  codex: `${GATEWAY_DEVELOPER_TOOLS_DOCS_URL}/codex-gateway`,
  opencode: `${GATEWAY_DEVELOPER_TOOLS_DOCS_URL}/opencode-gateway`,
  "copilot-cli": `${GATEWAY_DEVELOPER_TOOLS_DOCS_URL}/github-copilot-gateway#cli`,
  "copilot-desktop": `${GATEWAY_DEVELOPER_TOOLS_DOCS_URL}/github-copilot-gateway#app`,
} as const;
