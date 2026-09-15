import { buildTracePath } from "@langfuse/shared";
import { getInAppAgentInstrumentationTraceId } from "@langfuse/shared/in-app-agent";

export function getInAppAgentTraceHref(params: {
  aiFeaturesProjectId: string | undefined;
  runId: string | undefined;
}): string | undefined {
  if (!params.aiFeaturesProjectId || !params.runId) {
    return undefined;
  }

  return buildTracePath({
    projectId: params.aiFeaturesProjectId,
    traceId: getInAppAgentInstrumentationTraceId(params.runId),
  });
}
