import {
  getToolObservationCallId,
  type ToolObservation,
} from "@/src/features/sessions/SessionConversationTimeline/fns/getToolObservationCallId";

export function getStandaloneToolCallIds(
  observations: readonly ToolObservation[],
) {
  const toolCallIds = new Set<string>();

  for (const observation of observations) {
    if (observation.type !== "TOOL") continue;
    const toolCallId = getToolObservationCallId(observation);
    if (toolCallId) toolCallIds.add(toolCallId);
  }

  return toolCallIds;
}
