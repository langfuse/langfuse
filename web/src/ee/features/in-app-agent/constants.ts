// Avoid renaming this as the FE is aware of this when rendering, renaming it would cause history issues
export const IN_APP_AGENT_REDIRECT_TOOL_NAME = "langfuse_proposeRedirect";

// Header used only by Langfuse's server-side in-app agent when it calls the
// Langfuse MCP endpoint with a temporary in-app-agent API key.
export const IN_APP_AGENT_MCP_RUN_SECRET_HEADER =
  "x-langfuse-in-app-agent-run-secret";
