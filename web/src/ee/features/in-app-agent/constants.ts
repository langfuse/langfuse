// Avoid renaming this as the FE is aware of this when rendering, renaming it would cause history issues
export const IN_APP_AGENT_REDIRECT_TOOL_NAME = "langfuse_proposeRedirect";

// Header used only by Langfuse's server-side in-app agent when it calls the
// Langfuse MCP endpoint with a temporary in-app-agent API key and run override.
export const IN_APP_AGENT_MCP_TOOL_OVERRIDE_HEADER =
  "x-langfuse-in-app-agent-tool-override";

// Observation ids stay equal to the per-turn run id so persisted messages,
// feedback, and traced generations all point at the same Langfuse observation.
export const getInAppAgentInstrumentationObservationId = (runId: string) =>
  runId;

// Each in-app agent turn gets its own trace derived from the run id so trace-
// level telemetry and feedback aggregate on the same per-turn trace.
export const getInAppAgentInstrumentationTraceId = (runId: string) =>
  `${runId}-trace`;
