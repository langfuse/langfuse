import { type ToolCallPart } from "@langfuse/shared/src/utils/normalized-io";

import {
  getToolObservationCallId,
  type ToolObservation,
} from "@/src/features/sessions/SessionConversationTimeline/fns/getToolObservationCallId";

const canonicalizeToolInput = (value: unknown): unknown => {
  let parsedValue = value;
  if (typeof value === "string") {
    try {
      parsedValue = JSON.parse(value) as unknown;
    } catch {
      return value;
    }
  }

  if (Array.isArray(parsedValue)) {
    return parsedValue.map(canonicalizeToolInput);
  }
  if (typeof parsedValue !== "object" || parsedValue === null) {
    return parsedValue;
  }

  return Object.fromEntries(
    Object.entries(parsedValue)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nestedValue]) => [key, canonicalizeToolInput(nestedValue)]),
  );
};

const getToolSemanticKey = (name: string | null | undefined, input: unknown) =>
  name ? JSON.stringify([name, canonicalizeToolInput(input)]) : null;

export function getSemanticallyMatchedChildToolCalls({
  rolledUpToolCalls,
  allToolCalls,
  childToolObservations,
}: {
  rolledUpToolCalls: readonly ToolCallPart[];
  allToolCalls: readonly ToolCallPart[];
  childToolObservations: readonly ToolObservation[];
}) {
  const emittedToolCallIds = new Set(
    allToolCalls.flatMap((toolCall) =>
      toolCall.toolCallId ? [toolCall.toolCallId] : [],
    ),
  );
  const unmatchedChildrenBySemanticKey = new Map<string, ToolObservation[]>();
  for (const observation of childToolObservations) {
    if (observation.type !== "TOOL") continue;
    const observationCallId = getToolObservationCallId(observation);
    if (observationCallId && emittedToolCallIds.has(observationCallId))
      continue;

    const semanticKey = getToolSemanticKey(observation.name, observation.input);
    if (!semanticKey) continue;
    const matchingChildren = unmatchedChildrenBySemanticKey.get(semanticKey);
    if (matchingChildren) matchingChildren.push(observation);
    else unmatchedChildrenBySemanticKey.set(semanticKey, [observation]);
  }

  const unmatchedCallsBySemanticKey = new Map<string, ToolCallPart[]>();
  for (const toolCall of rolledUpToolCalls) {
    const semanticKey = getToolSemanticKey(toolCall.toolName, toolCall.input);
    if (!semanticKey) continue;
    const matchingCalls = unmatchedCallsBySemanticKey.get(semanticKey);
    if (matchingCalls) matchingCalls.push(toolCall);
    else unmatchedCallsBySemanticKey.set(semanticKey, [toolCall]);
  }

  const matchedCalls = new Set<ToolCallPart>();
  for (const [semanticKey, calls] of unmatchedCallsBySemanticKey) {
    if (calls.length !== 1) continue;
    if (unmatchedChildrenBySemanticKey.get(semanticKey)?.length !== 1) continue;
    const matchingCall = calls[0];
    if (matchingCall) matchedCalls.add(matchingCall);
  }
  return matchedCalls;
}
