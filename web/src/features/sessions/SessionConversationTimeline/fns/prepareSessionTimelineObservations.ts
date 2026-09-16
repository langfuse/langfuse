import {
  normalizeSpanIO,
  type NormalizedMessage,
  type ToolCallPart,
} from "@langfuse/shared/src/utils/normalized-io";

import { deduplicateTimelineInput } from "@/src/features/sessions/SessionConversationTimeline/fns/deduplicateTimelineInput";
import { getToolObservationCallId } from "@/src/features/sessions/SessionConversationTimeline/fns/getToolObservationCallId";
import { getStandaloneToolCallIds } from "@/src/features/sessions/SessionConversationTimeline/fns/getStandaloneToolCallIds";
import { processTimelineMessages } from "@/src/features/sessions/SessionConversationTimeline/fns/processTimelineMessages";

export type SessionTimelineObservation = {
  id: string;
  traceId: string | null;
  parentObservationId?: string | null;
  name?: string | null;
  type: string | null;
  startTime: Date;
  input: unknown;
  output: unknown;
  metadata: unknown;
  inputTruncated?: boolean;
  outputTruncated?: boolean;
  metadataTruncated?: boolean;
};

export type ParsedSessionTimelineObservation =
  | {
      type: "loaded";
      messages: ReturnType<typeof normalizeSpanIO>["messages"];
    }
  | { type: "error" };

type ProcessedSessionTimelineMessages = ReturnType<
  typeof processTimelineMessages
>[number];
export type PreparedSessionTimelineMessages = Pick<
  ProcessedSessionTimelineMessages,
  "messages"
>;

type PreparedSessionTimelineItemBase<
  Observation extends SessionTimelineObservation,
> = {
  observation: Observation;
  parsed: ParsedSessionTimelineObservation | null;
  processedMessages: PreparedSessionTimelineMessages;
  phase: "complete" | "start" | "end";
  ancestorObservationIds: readonly string[];
  nestedObservationCounts: Readonly<Record<string, number>>;
};

export type PreparedSessionTimelineItem<
  Observation extends SessionTimelineObservation,
> =
  | (PreparedSessionTimelineItemBase<Observation> & {
      type: "observation";
    })
  | (PreparedSessionTimelineItemBase<Observation> & {
      type: "tool";
      id: string;
      toolCall: ToolCallPart;
    });

const EMPTY_TOOL_CALL_IDS: ReadonlySet<string> = new Set();

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

export function prepareSessionTimelineObservations<
  Observation extends SessionTimelineObservation,
>(observations: readonly Observation[]) {
  const chronologicalObservations = observations
    .map((observation, originalIndex) => ({ observation, originalIndex }))
    .sort(
      (left, right) =>
        left.observation.startTime.getTime() -
          right.observation.startTime.getTime() ||
        left.originalIndex - right.originalIndex,
    );
  const parsedObservations = chronologicalObservations.map(
    ({ observation }) => {
      if (
        observation.type === "TOOL" ||
        observation.inputTruncated ||
        observation.outputTruncated
      ) {
        return { parsed: null, messages: null };
      }

      try {
        const messages = normalizeSpanIO({
          input: observation.input,
          output: observation.output,
          metadata: observation.metadataTruncated
            ? undefined
            : observation.metadata,
        }).messages;

        return {
          parsed: { type: "loaded", messages } as const,
          messages,
        };
      } catch {
        return {
          parsed: { type: "error" } as const,
          messages: null,
        };
      }
    },
  );
  const observationsByTraceId = new Map<string | null, Observation[]>();
  for (const observation of observations) {
    const traceObservations = observationsByTraceId.get(observation.traceId);
    if (traceObservations) traceObservations.push(observation);
    else observationsByTraceId.set(observation.traceId, [observation]);
  }
  const standaloneToolCallIdsByTraceId = new Map(
    Array.from(observationsByTraceId, ([traceId, traceObservations]) => [
      traceId,
      getStandaloneToolCallIds(traceObservations),
    ]),
  );

  const processedMessageGroups = processTimelineMessages({
    messageGroups: parsedObservations.map(({ messages }) => messages),
    reconcileHistory: chronologicalObservations.map(
      ({ observation }) => observation.type === "GENERATION",
    ),
    standaloneToolCallIdsByGroup: chronologicalObservations.map(
      ({ observation }) =>
        standaloneToolCallIdsByTraceId.get(observation.traceId) ??
        EMPTY_TOOL_CALL_IDS,
    ),
  });

  const chronologicalPreparedObservations = chronologicalObservations.map(
    ({ observation, originalIndex }, index) => ({
      originalIndex,
      prepared: {
        observation,
        parsed: parsedObservations[index]?.parsed ?? null,
        processedMessages: processedMessageGroups[index] ?? {
          messages: [],
          rolledUpToolCalls: [],
        },
      },
    }),
  );

  const latestToolCallById = new Map<string, ToolCallPart>();
  for (const { prepared } of chronologicalPreparedObservations) {
    for (const toolCall of prepared.processedMessages.rolledUpToolCalls) {
      if (!toolCall.toolCallId) continue;
      latestToolCallById.set(
        `${prepared.observation.traceId ?? ""}\0${toolCall.toolCallId}`,
        toolCall,
      );
    }
  }
  for (const { prepared } of chronologicalPreparedObservations) {
    prepared.processedMessages.rolledUpToolCalls =
      prepared.processedMessages.rolledUpToolCalls.filter(
        (toolCall) =>
          !toolCall.toolCallId ||
          latestToolCallById.get(
            `${prepared.observation.traceId ?? ""}\0${toolCall.toolCallId}`,
          ) === toolCall,
      );
  }

  const toolObservationsBySemanticKey = new Map<string, Observation[]>();
  const directToolCallsBySemanticKey = new Map<string, ToolCallPart[]>();
  const siblingToolCallsBySemanticKey = new Map<string, ToolCallPart[]>();
  const emittedToolCallIds = new Set<string>();
  for (const { prepared } of chronologicalPreparedObservations) {
    if (prepared.parsed?.type !== "loaded") continue;
    for (const message of prepared.parsed.messages) {
      for (const part of message.parts) {
        if (part.type !== "tool-call" || !part.toolCallId) continue;
        emittedToolCallIds.add(
          `${prepared.observation.traceId ?? ""}\0${part.toolCallId}`,
        );
      }
    }
  }
  for (const { prepared } of chronologicalPreparedObservations) {
    const { observation } = prepared;
    if (observation.type === "TOOL") {
      const observationCallId = getToolObservationCallId(observation);
      if (
        observationCallId &&
        emittedToolCallIds.has(
          `${observation.traceId ?? ""}\0${observationCallId}`,
        )
      ) {
        continue;
      }

      const semanticKey = getToolSemanticKey(
        observation.name,
        observation.input,
      );
      if (semanticKey) {
        const directKey = `${observation.traceId ?? ""}\0${observation.parentObservationId ?? ""}\0${semanticKey}`;
        const directMatches = toolObservationsBySemanticKey.get(directKey);
        if (directMatches) directMatches.push(observation);
        else toolObservationsBySemanticKey.set(directKey, [observation]);
      }
    }

    for (const toolCall of prepared.processedMessages.rolledUpToolCalls) {
      const semanticKey = getToolSemanticKey(toolCall.toolName, toolCall.input);
      if (!semanticKey) continue;
      const directKey = `${observation.traceId ?? ""}\0${observation.id}\0${semanticKey}`;
      const directMatches = directToolCallsBySemanticKey.get(directKey);
      if (directMatches) directMatches.push(toolCall);
      else directToolCallsBySemanticKey.set(directKey, [toolCall]);

      const siblingKey = `${observation.traceId ?? ""}\0${observation.parentObservationId ?? ""}\0${semanticKey}`;
      const siblingMatches = siblingToolCallsBySemanticKey.get(siblingKey);
      if (siblingMatches) siblingMatches.push(toolCall);
      else siblingToolCallsBySemanticKey.set(siblingKey, [toolCall]);
    }
  }
  const matchedToolCalls = new Set<ToolCallPart>();
  const matchedToolObservations = new Set<Observation>();
  for (const [semanticKey, toolCalls] of directToolCallsBySemanticKey) {
    if (toolCalls.length !== 1) continue;
    const toolObservations = toolObservationsBySemanticKey.get(semanticKey);
    if (toolObservations?.length !== 1) continue;
    const matchingCall = toolCalls[0];
    const matchingObservation = toolObservations[0];
    if (!matchingCall || !matchingObservation) continue;
    matchedToolCalls.add(matchingCall);
    matchedToolObservations.add(matchingObservation);
  }
  for (const [semanticKey, toolCalls] of siblingToolCallsBySemanticKey) {
    const unmatchedToolCalls = toolCalls.filter(
      (toolCall) => !matchedToolCalls.has(toolCall),
    );
    if (unmatchedToolCalls.length !== 1) continue;
    const unmatchedToolObservations = (
      toolObservationsBySemanticKey.get(semanticKey) ?? []
    ).filter((observation) => !matchedToolObservations.has(observation));
    if (unmatchedToolObservations.length !== 1) continue;
    const matchingCall = unmatchedToolCalls[0];
    const matchingObservation = unmatchedToolObservations[0];
    if (!matchingCall || !matchingObservation) continue;
    matchedToolCalls.add(matchingCall);
    matchedToolObservations.add(matchingObservation);
  }
  if (matchedToolCalls.size > 0) {
    for (const { prepared } of chronologicalPreparedObservations) {
      prepared.processedMessages.rolledUpToolCalls =
        prepared.processedMessages.rolledUpToolCalls.filter(
          (toolCall) => !matchedToolCalls.has(toolCall),
        );
    }
  }

  const preparedObservations = chronologicalPreparedObservations
    .sort((left, right) => left.originalIndex - right.originalIndex)
    .map(({ prepared }) => prepared);
  const observationKey = (observation: Observation) =>
    `${observation.traceId ?? ""}\0${observation.id}`;
  const preparedByKey = new Map(
    preparedObservations.map((prepared) => [
      observationKey(prepared.observation),
      prepared,
    ]),
  );
  const childrenByParentKey = new Map<string, typeof preparedObservations>();

  for (const prepared of preparedObservations) {
    const { observation } = prepared;
    if (!observation.parentObservationId) continue;

    const parentKey = `${observation.traceId ?? ""}\0${observation.parentObservationId}`;
    if (
      parentKey === observationKey(observation) ||
      !preparedByKey.has(parentKey)
    ) {
      continue;
    }

    const children = childrenByParentKey.get(parentKey);
    if (children) {
      children.push(prepared);
      children.sort(
        (left, right) =>
          left.observation.startTime.getTime() -
          right.observation.startTime.getTime(),
      );
    } else childrenByParentKey.set(parentKey, [prepared]);
  }

  const result: PreparedSessionTimelineItem<Observation>[] = [];
  const emitted = new Set<string>();
  const active = new Set<string>();
  const nestedObservationCountsByKey = new Map<
    string,
    Readonly<Record<string, number>>
  >();
  const getNestedObservationCounts = (
    key: string,
    activeKeys: ReadonlySet<string>,
  ) => {
    const cached = nestedObservationCountsByKey.get(key);
    if (cached) return cached;

    const nextActiveKeys = new Set(activeKeys).add(key);
    const counts: Record<string, number> = {};
    const rolledUpToolCallCount =
      preparedByKey.get(key)?.processedMessages.rolledUpToolCalls.length ?? 0;
    if (rolledUpToolCallCount > 0) counts.TOOL = rolledUpToolCallCount;

    for (const child of childrenByParentKey.get(key) ?? []) {
      const childKey = observationKey(child.observation);
      if (nextActiveKeys.has(childKey)) continue;

      const type = child.observation.type ?? "EVENT";
      counts[type] = (counts[type] ?? 0) + 1;
      for (const [nestedType, count] of Object.entries(
        getNestedObservationCounts(childKey, nextActiveKeys),
      )) {
        counts[nestedType] = (counts[nestedType] ?? 0) + count;
      }
    }
    nestedObservationCountsByKey.set(key, counts);
    return counts;
  };
  const appendTimelineItems = ({
    prepared,
    phase,
    messages,
    rolledUpToolCalls,
    ancestorObservationIds,
    nestedObservationCounts,
  }: {
    prepared: (typeof preparedObservations)[number];
    phase: "complete" | "start" | "end";
    messages: ProcessedSessionTimelineMessages["messages"];
    rolledUpToolCalls: readonly ToolCallPart[];
    ancestorObservationIds: readonly string[];
    nestedObservationCounts: Readonly<Record<string, number>>;
  }) => {
    result.push({
      type: "observation",
      observation: prepared.observation,
      parsed: prepared.parsed,
      processedMessages: { messages },
      phase,
      ancestorObservationIds,
      nestedObservationCounts,
    });
    rolledUpToolCalls.forEach((toolCall, index) => {
      result.push({
        type: "tool",
        id: `${prepared.observation.id}-tool-call-${toolCall.toolCallId ?? index}`,
        observation: prepared.observation,
        toolCall,
        parsed: null,
        processedMessages: { messages: [] },
        phase: "complete",
        ancestorObservationIds: ancestorObservationIds.concat(
          prepared.observation.id,
        ),
        nestedObservationCounts: {},
      });
    });
  };
  const emit = (
    prepared: (typeof preparedObservations)[number],
    ancestorMessages: readonly NormalizedMessage[],
    ancestorObservationIds: readonly string[],
  ) => {
    const key = observationKey(prepared.observation);
    if (emitted.has(key) || active.has(key)) return;

    const children = childrenByParentKey.get(key) ?? [];
    const messages = deduplicateTimelineInput(
      prepared.processedMessages.messages,
      ancestorMessages,
    );
    const contextualPrepared = {
      ...prepared,
      processedMessages: { ...prepared.processedMessages, messages },
      ancestorObservationIds,
      nestedObservationCounts: getNestedObservationCounts(key, new Set()),
    };
    const rolledUpToolCalls =
      contextualPrepared.processedMessages.rolledUpToolCalls;
    if (children.length === 0 && rolledUpToolCalls.length === 0) {
      emitted.add(key);
      appendTimelineItems({
        prepared,
        phase: "complete",
        messages: contextualPrepared.processedMessages.messages,
        rolledUpToolCalls: [],
        ancestorObservationIds,
        nestedObservationCounts: contextualPrepared.nestedObservationCounts,
      });
      return;
    }

    active.add(key);
    appendTimelineItems({
      prepared,
      phase: "start",
      messages: messages.filter((message) => message.source === "input"),
      rolledUpToolCalls,
      ancestorObservationIds,
      nestedObservationCounts: contextualPrepared.nestedObservationCounts,
    });
    const ownMessages =
      prepared.parsed?.type === "loaded" ? prepared.parsed.messages : messages;
    const descendantContext = ancestorMessages.concat(ownMessages);
    const descendantObservationIds = ancestorObservationIds.concat(
      prepared.observation.id,
    );
    for (const child of children) {
      emit(child, descendantContext, descendantObservationIds);
    }
    appendTimelineItems({
      prepared,
      phase: "end",
      messages: messages.filter((message) => message.source === "output"),
      rolledUpToolCalls: [],
      ancestorObservationIds,
      nestedObservationCounts: contextualPrepared.nestedObservationCounts,
    });
    active.delete(key);
    emitted.add(key);
  };

  for (const prepared of preparedObservations) {
    const parentKey = prepared.observation.parentObservationId
      ? `${prepared.observation.traceId ?? ""}\0${prepared.observation.parentObservationId}`
      : null;
    if (parentKey && preparedByKey.has(parentKey)) continue;
    emit(prepared, [], []);
  }
  for (const prepared of preparedObservations) emit(prepared, [], []);

  return result;
}
