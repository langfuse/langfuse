import { safeJsonParse } from "@langfuse/shared";
import { IN_APP_AGENT_TOOL_REJECTION_ERROR_CODE } from "@langfuse/shared/in-app-agent";

export function shouldPerformToolSideEffects(toolError: unknown) {
  const parsedError =
    typeof toolError === "string" ? safeJsonParse(toolError) : toolError;

  if (
    typeof parsedError !== "object" ||
    parsedError === null ||
    !("code" in parsedError)
  ) {
    return true;
  }

  return parsedError.code !== IN_APP_AGENT_TOOL_REJECTION_ERROR_CODE;
}
