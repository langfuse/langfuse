import {
  type NormalizedMessage,
  type NormalizedMessagePart,
  type ToolCallPart,
} from "@langfuse/shared/src/utils/normalized-io";

type ToolObservation = {
  type?: string | null;
  name?: string | null;
  input?: unknown;
  metadata: unknown;
  metadataTruncated?: boolean;
};

type ConversationPart = Exclude<
  NormalizedMessagePart,
  { type: "tool-call" | "tool-result" }
>;

type ConversationEntry = {
  key: string;
  messageIndex: number;
  partIndex: number;
};

function getConversationEntries(
  messages: NormalizedMessage[],
  source?: NormalizedMessage["source"],
) {
  const entries: ConversationEntry[] = [];

  messages.forEach((message, messageIndex) => {
    if (source && message.source !== source) return;

    message.parts.forEach((part, partIndex) => {
      if (part.type === "tool-call" || part.type === "tool-result") return;

      const { providerMetadata: _providerMetadata, ...semanticPart } = part;
      entries.push({
        key: JSON.stringify([
          message.role,
          message.senderName ?? null,
          semanticPart,
        ]),
        messageIndex,
        partIndex,
      });
    });
  });

  return entries;
}

function getHistoricalInputIndices(
  previousContext: ConversationEntry[],
  currentInput: ConversationEntry[],
) {
  const remainingOccurrencesByKey = new Map<string, number>();
  for (const previousEntry of previousContext) {
    remainingOccurrencesByKey.set(
      previousEntry.key,
      (remainingOccurrencesByKey.get(previousEntry.key) ?? 0) + 1,
    );
  }

  const historicalInputIndices = new Set<number>();
  currentInput.forEach((entry, index) => {
    const remainingOccurrences = remainingOccurrencesByKey.get(entry.key) ?? 0;
    if (remainingOccurrences === 0) return;

    historicalInputIndices.add(index);
    remainingOccurrencesByKey.set(entry.key, remainingOccurrences - 1);
  });

  return historicalInputIndices;
}

export function deduplicateTimelineInput(
  messages: NormalizedMessage[],
  ancestorMessages: NormalizedMessage[],
) {
  const currentInput = getConversationEntries(messages, "input");
  const ancestorInput = getConversationEntries(ancestorMessages, "input");
  const historicalInputIndices = getHistoricalInputIndices(
    ancestorInput,
    currentInput,
  );
  const historicalParts = new Set(
    currentInput
      .filter((_entry, index) => historicalInputIndices.has(index))
      .map((entry) => `${entry.messageIndex}:${entry.partIndex}`),
  );

  return messages.flatMap((message, messageIndex) => {
    if (message.source === "output") return [message];

    const parts = message.parts.filter(
      (_part, partIndex) =>
        !historicalParts.has(`${messageIndex}:${partIndex}`),
    );
    return parts.length > 0 ? [{ ...message, parts }] : [];
  });
}

function getVisibleMessages({
  messages,
  currentInput,
  historicalInputIndices,
  showSystemPrompt,
}: {
  messages: NormalizedMessage[];
  currentInput: ConversationEntry[];
  historicalInputIndices: ReadonlySet<number>;
  showSystemPrompt: boolean;
}) {
  const historicalParts = new Set(
    currentInput
      .filter((_entry, index) => historicalInputIndices.has(index))
      .map((entry) => `${entry.messageIndex}:${entry.partIndex}`),
  );
  const visibleMessages: NormalizedMessage[] = [];

  messages.forEach((message, messageIndex) => {
    if (!showSystemPrompt && message.role === "system") return;

    const parts = message.parts.filter(
      (part, partIndex): part is ConversationPart => {
        if (part.type === "tool-call" || part.type === "tool-result") {
          return false;
        }
        if (message.source === "output") return true;

        return !historicalParts.has(`${messageIndex}:${partIndex}`);
      },
    );
    if (parts.length === 0) return;

    if (message.role !== "system") {
      visibleMessages.push({ ...message, parts });
      return;
    }

    const systemMessage = visibleMessages.find(
      (visibleMessage) => visibleMessage.role === "system",
    );
    if (systemMessage) {
      systemMessage.parts = systemMessage.parts.concat(parts);
      return;
    }

    visibleMessages.push({ ...message, parts });
  });

  return visibleMessages;
}

const getToolObservationCallId = (observation: ToolObservation) => {
  if (observation.metadataTruncated) return null;

  let metadataValue: unknown = observation.metadata;
  if (typeof metadataValue === "string") {
    try {
      metadataValue = JSON.parse(metadataValue) as unknown;
    } catch {
      return null;
    }
  }
  if (
    typeof metadataValue !== "object" ||
    metadataValue === null ||
    Array.isArray(metadataValue)
  ) {
    return null;
  }

  const metadata = metadataValue as Record<string, unknown>;
  const toolCallId = metadata.toolCallId ?? metadata.callID;
  return typeof toolCallId === "string" && toolCallId.length > 0
    ? toolCallId
    : null;
};

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

/**
 * Produces the newly added conversation and tool rows for each observation.
 * Input part occurrences already present in the previous conversation context
 * are omitted; outputs always remain visible and become the next history.
 */
export function processTimelineMessages({
  messageGroups,
  reconcileHistory,
  showSystemPrompt,
  standaloneToolCallIdsByGroup,
}: {
  messageGroups: readonly (NormalizedMessage[] | null)[];
  reconcileHistory: readonly boolean[];
  showSystemPrompt: boolean;
  standaloneToolCallIdsByGroup: readonly ReadonlySet<string>[];
}) {
  const processedGroups: Array<{
    messages: NormalizedMessage[];
    rolledUpToolCalls: ToolCallPart[];
  }> = [];
  let previousContext: ConversationEntry[] = [];

  for (const [groupIndex, messages] of messageGroups.entries()) {
    if (messages === null) {
      processedGroups.push({ messages: [], rolledUpToolCalls: [] });
      continue;
    }

    const currentInput = getConversationEntries(messages, "input");
    const currentOutput = getConversationEntries(messages, "output");
    const shouldReconcileHistory = reconcileHistory[groupIndex] ?? false;
    const historicalInputIndices = shouldReconcileHistory
      ? getHistoricalInputIndices(previousContext, currentInput)
      : new Set<number>();
    const rolledUpToolCalls = messages.flatMap((message) =>
      message.source === "output"
        ? message.parts.filter(
            (part): part is ToolCallPart =>
              part.type === "tool-call" &&
              (!part.toolCallId ||
                !standaloneToolCallIdsByGroup[groupIndex]?.has(
                  part.toolCallId,
                )),
          )
        : [],
    );

    processedGroups.push({
      messages: getVisibleMessages({
        messages,
        currentInput,
        historicalInputIndices,
        showSystemPrompt,
      }),
      rolledUpToolCalls,
    });
    if (shouldReconcileHistory) {
      previousContext = currentInput.concat(currentOutput);
    }
  }

  return processedGroups;
}
