import { normalizeSpanIO } from "@langfuse/shared/src/utils/normalized-io";

import {
  getStandaloneToolCallIds,
  processTimelineMessages,
} from "@/src/components/session/SessionConversationTimeline/fns/processTimelineMessages";

export type SessionTimelineObservation = {
  id: string;
  traceId: string | null;
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

export type ProcessedSessionTimelineMessages = ReturnType<
  typeof processTimelineMessages
>[number];

export type PreparedSessionTimelineObservation<
  Observation extends SessionTimelineObservation,
> = {
  observation: Observation;
  parsed: ParsedSessionTimelineObservation | null;
  processedMessages: ProcessedSessionTimelineMessages;
};

const EMPTY_TOOL_CALL_IDS: ReadonlySet<string> = new Set();

export function prepareSessionTimelineObservations<
  Observation extends SessionTimelineObservation,
>(observations: readonly Observation[], showSystemPrompt: boolean) {
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
    showSystemPrompt,
    standaloneToolCallIdsByGroup: chronologicalObservations.map(
      ({ observation }) =>
        standaloneToolCallIdsByTraceId.get(observation.traceId) ??
        EMPTY_TOOL_CALL_IDS,
    ),
  });

  return chronologicalObservations
    .map(({ observation, originalIndex }, index) => ({
      originalIndex,
      prepared: {
        observation,
        parsed: parsedObservations[index]?.parsed ?? null,
        processedMessages: processedMessageGroups[index] ?? {
          messages: [],
          rolledUpToolCalls: [],
        },
      },
    }))
    .sort((left, right) => left.originalIndex - right.originalIndex)
    .map(
      ({ prepared }) => prepared,
    ) satisfies PreparedSessionTimelineObservation<Observation>[];
}
