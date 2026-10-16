// Avoid renaming this as the FE is aware of this when rendering, renaming it would cause history issues
export const IN_APP_AGENT_REDIRECT_TOOL_NAME = "langfuse_proposeRedirect";

// Persisted in transcripts like the redirect tool name; do not rename.
export const IN_APP_AGENT_QUESTIONNAIRE_TOOL_NAME = "langfuse_askUserQuestions";

export const IN_APP_AGENT_TOOL_REJECTION_ERROR_CODE = "tool_call_rejected";

export const IN_APP_AGENT_GENERIC_ERROR_MESSAGE =
  "An error occurred. Please try again or start a new conversation.";

export const IN_APP_AGENT_SILENT_MCP_OUTPUT_TYPE = "silent-mcp-output";
export const IN_APP_AGENT_SILENT_MCP_OUTPUT_MESSAGE =
  "Output saved to /workspace/tool_calls";

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

// Per-LLM-call generation ids stay deterministic from the run so retries and
// late flushes can address the same observation.
export const getInAppAgentLlmCallObservationId = (
  runId: string,
  stepNumber: number,
) => `${runId}-llm-${stepNumber}`;

// Product traces and feedback scores for the in-app agent. Must match so
// scores attach to the same traces evaluators in the AI-features project see.
export const IN_APP_AGENT_PRODUCT_ENVIRONMENT = "production";
