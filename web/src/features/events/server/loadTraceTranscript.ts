import { isEqual } from "lodash";
import {
  assembleTranscript,
  getObservationByIdFromEventsTable,
  getObservationsForTraceFromEventsTable,
  MAX_OBSERVATIONS_PER_TRACE,
  orderObservations,
  normalizeIO,
  type Transcript,
} from "@langfuse/shared/src/server";
import {
  normalizeSpanIO,
  type NormalizedMessage,
  type ToolCallPart,
} from "@langfuse/shared/src/utils/normalized-io";
import { assembleSessionTraceTranscript } from "./assembleSessionTraceTranscript";

/** Generations and tools whose I/O one transcript reads at most. */
const MAX_TRANSCRIPT_OBSERVATIONS = 1_000;

const TRANSCRIPT_OBSERVATION_TYPES = new Set(["GENERATION", "TOOL"]);

type Observation = Awaited<
  ReturnType<typeof getObservationsForTraceFromEventsTable>
>["observations"][number];

/**
 * Load a trace's observations from the events table, walk them in trace tree
 * order, and assemble the transcript of its generations and tools.
 */
export async function loadTraceTranscript(trace: {
  projectId: string;
  traceId: string;
  /** Trace timestamp; observations from one hour before it onwards are read. */
  timestamp: Date;
  /**
   * For session rendering, recover calls from TOOL metadata and pair text-only
   * or JSON-only responses when observation names uniquely identify their calls.
   * Ambiguous responses remain unchanged. Disabled by default.
   */
  recoverToolResponses?: boolean;
  /** Use root observation I/O when no generation/tool transcript exists. */
  fallbackToRootIO?: boolean;
}): Promise<{
  transcript: Transcript | null;
  /** The trace has more observations than the transcript could read. */
  cutoff: boolean;
}> {
  // The structure of every observation orders the walk; only generations and
  // tools carry I/O, which is what the transcript reads.
  const [structure, content] = await Promise.all([
    getObservationsForTraceFromEventsTable(trace),
    getObservationsForTraceFromEventsTable({
      ...trace,
      selectIOAndMetadata: true,
      types: ["GENERATION", "TOOL"],
      limit: MAX_TRANSCRIPT_OBSERVATIONS,
    }),
  ]);
  const contentById = new Map(content.observations.map((o) => [o.id, o]));
  // Generations and tools past the content cap have no I/O to show; leaving
  // them out beats rendering them as empty turns. `cutoff` tells the caller.
  const observations = structure.observations.flatMap((o) => {
    const withContent = contentById.get(o.id);
    if (withContent) return [withContent];
    return TRANSCRIPT_OBSERVATION_TYPES.has(o.type) ? [] : [o];
  });
  let transcript = (() => {
    if (!trace.recoverToolResponses) {
      return assembleTranscript(orderObservations(observations));
    }
    const recovered = recoverToolCalls(observations);
    return pairToolResponses(
      assembleSessionTraceTranscript(
        orderObservations(recovered.observations),
        recovered.transformOutput,
      ),
      recovered.observationsByTraceAndId,
    );
  })();
  if (!transcript && trace.fallbackToRootIO) {
    const root = structure.observations.find(
      (observation) =>
        observation.isRootObservation === true ||
        !observation.parentObservationId,
    );
    if (root) {
      const rootWithContent = await getObservationByIdFromEventsTable({
        projectId: trace.projectId,
        traceId: trace.traceId,
        id: root.id,
        startTime: root.startTime,
        fetchWithInputOutput: true,
      });
      if (rootWithContent) {
        const { messages } = normalizeIO({
          kind: "io",
          io: {
            input: rootWithContent.input,
            output: rootWithContent.output,
            metadata: rootWithContent.metadata,
          },
        });
        if (messages.length > 0) {
          transcript = {
            threads: [
              {
                conversationHistory: [],
                currentTurn: {
                  nestingLevel: 0,
                  observations: [{ id: root.id, traceId: trace.traceId }],
                  messages: messages.map((message) => ({
                    ...message,
                    observationId: root.id,
                    traceId: trace.traceId,
                    startTime: rootWithContent.startTime,
                    endTime: rootWithContent.endTime,
                  })),
                },
              },
            ],
          };
        }
      }
    }
  }
  const cutoff =
    structure.totalCount > MAX_OBSERVATIONS_PER_TRACE ||
    content.totalCount > MAX_TRANSCRIPT_OBSERVATIONS;
  return {
    transcript,
    cutoff,
  };
}

function recoverToolCalls(observations: Observation[]) {
  const observationsByTraceAndId = new Map<
    Observation["traceId"],
    Map<string, Observation>
  >();
  const callsByParent = new Map<string, ToolCallPart[]>();
  const toolsByObservation = new Map<string, string>();
  const callCountsByTrace = new Map<
    Observation["traceId"],
    Map<string, number>
  >();
  for (const observation of observations) {
    let byId = observationsByTraceAndId.get(observation.traceId);
    if (!byId) {
      byId = new Map();
      observationsByTraceAndId.set(observation.traceId, byId);
    }
    // Preserve the first match, as the previous array lookup did.
    if (!byId.has(observation.id)) byId.set(observation.id, observation);

    if (observation.type !== "TOOL") continue;
    const callId = observation.metadata?.callID;
    if (typeof callId !== "string" || !callId) continue;
    let counts = callCountsByTrace.get(observation.traceId);
    if (!counts) {
      counts = new Map();
      callCountsByTrace.set(observation.traceId, counts);
    }
    counts.set(callId, (counts.get(callId) ?? 0) + 1);
  }

  // Some plugins omit calls from generation output. A TOOL's unique call ID
  // and same-trace generation parent recover that anchor without name guessing.
  for (const observation of observations) {
    if (
      observation.type !== "TOOL" ||
      !observation.name ||
      !observation.parentObservationId
    )
      continue;
    const callId = observation.metadata?.callID;
    if (typeof callId !== "string" || !callId) continue;
    if (callCountsByTrace.get(observation.traceId)?.get(callId) !== 1) continue;
    const parent = observationsByTraceAndId
      .get(observation.traceId)
      ?.get(observation.parentObservationId);
    if (parent?.type !== "GENERATION") continue;
    const outputParts = normalizeSpanIO({
      input: undefined,
      output: observation.output,
      metadata: undefined,
    }).messages.flatMap((message) => message.parts);
    const explicitResults = outputParts.flatMap((part) =>
      part.type === "tool-result" && part.toolCallId ? [part] : [],
    );
    if (explicitResults.some((part) => part.toolCallId !== callId)) continue;
    const normalized = normalizeSpanIO({
      input: undefined,
      metadata: undefined,
      output: {
        type: "tool-call",
        toolCallId: callId,
        toolName: observation.name,
        input: observation.input,
      },
    });
    const call = normalized.messages
      .flatMap((message) => message.parts)
      .find((part): part is ToolCallPart => part.type === "tool-call");
    if (!call) continue;
    const parentKey = JSON.stringify([parent.traceId, parent.id]);
    const calls = callsByParent.get(parentKey);
    if (calls) calls.push(call);
    else callsByParent.set(parentKey, [call]);
    if (!explicitResults.length) {
      toolsByObservation.set(
        JSON.stringify([observation.traceId, observation.id]),
        callId,
      );
    }
  }

  const resolvedCallIds = new Set<string>();
  const transformOutput = (
    observation: Observation,
    messages: NormalizedMessage[],
  ): NormalizedMessage[] => {
    if (observation.type === "TOOL") {
      const callId = toolsByObservation.get(
        JSON.stringify([observation.traceId, observation.id]),
      );
      if (
        !callId ||
        !resolvedCallIds.has(JSON.stringify([observation.traceId, callId]))
      )
        return messages;
      const parts = messages.flatMap((message) => message.parts);
      // Tool-result payloads are JSON; wrapping media would discard the file
      // parts the session renderer needs for previews.
      if (
        !parts.length ||
        (!parts.every((part) => part.type === "text") &&
          !parts.every((part) => part.type === "data"))
      )
        return messages;
      return normalizeSpanIO({
        input: undefined,
        metadata: undefined,
        output: {
          role: "tool",
          name: observation.name,
          tool_call_id: callId,
          content: observation.output,
        },
      }).messages;
    }
    const calls = callsByParent.get(
      JSON.stringify([observation.traceId, observation.id]),
    );
    if (!calls || observation.type !== "GENERATION") return messages;
    const existingIds = new Set(
      messages.flatMap((message) =>
        message.parts.flatMap((part) =>
          part.type === "tool-call" ? [part.toolCallId] : [],
        ),
      ),
    );
    const idlessCalls = messages.flatMap((message) =>
      message.parts.filter(
        (part): part is ToolCallPart =>
          part.type === "tool-call" && !part.toolCallId,
      ),
    );
    const replacements = new Map<ToolCallPart, ToolCallPart>();
    const missingCalls: ToolCallPart[] = [];
    for (const call of calls) {
      if (existingIds.has(call.toolCallId)) {
        resolvedCallIds.add(
          JSON.stringify([observation.traceId, call.toolCallId]),
        );
        continue;
      }
      const matches = idlessCalls.filter(
        (existing) =>
          existing.toolName === call.toolName &&
          isEqual(existing.input, call.input),
      );
      // Ambiguous existing calls cannot safely be completed or duplicated.
      if (matches.length > 0) {
        const recoveredMatches = calls.filter(
          (candidate) =>
            candidate.toolName === call.toolName &&
            isEqual(candidate.input, call.input),
        );
        if (matches.length === 1 && recoveredMatches.length === 1) {
          replacements.set(matches[0]!, call);
          resolvedCallIds.add(
            JSON.stringify([observation.traceId, call.toolCallId]),
          );
        }
        continue;
      }
      missingCalls.push(call);
      resolvedCallIds.add(
        JSON.stringify([observation.traceId, call.toolCallId]),
      );
    }
    if (!replacements.size && !missingCalls.length) return messages;
    const recoveredMessages = messages.map((message) => ({
      ...message,
      parts: message.parts.map((part) => {
        if (part.type !== "tool-call") return part;
        const replacement = replacements.get(part);
        return replacement
          ? { ...part, toolCallId: replacement.toolCallId }
          : part;
      }),
    }));
    return missingCalls.length
      ? [
          ...recoveredMessages,
          { role: "assistant", source: "output", parts: missingCalls },
        ]
      : recoveredMessages;
  };
  return {
    observations,
    observationsByTraceAndId,
    transformOutput,
  };
}

function pairToolResponses(
  transcript: Transcript | null,
  observationsByTraceAndId: Map<
    Observation["traceId"],
    Map<string, Observation>
  >,
): Transcript | null {
  // TODO: Evaluate moving general pairing into shared transcript assembly once
  // it preserves resolved call identity for text-only and JSON-only tool responses.
  if (!transcript) return null;
  return {
    ...transcript,
    threads: transcript.threads.map((thread) => {
      // Historical messages are already established context, not recovery targets.
      const messages = thread.currentTurn.messages;
      const callCounts = new Map<string, number>();
      for (const message of messages) {
        for (const part of message.parts) {
          if (part.type !== "tool-call" || !part.toolCallId) continue;
          callCounts.set(
            part.toolCallId,
            (callCounts.get(part.toolCallId) ?? 0) + 1,
          );
        }
      }
      const explicitIds = new Set(
        messages.flatMap((message) =>
          message.parts.flatMap((part) =>
            part.type === "tool-result" && part.toolCallId
              ? [part.toolCallId]
              : [],
          ),
        ),
      );
      const candidates = new Map<number, ToolCallPart>();
      const candidateCounts = new Map<string, number>();
      const anchorCallsByName = new Map<string, ToolCallPart | null>();
      for (const [index, message] of messages.entries()) {
        if (message.role !== "tool") {
          // Name matching is limited to the immediately preceding assistant
          // output and its consecutive tool responses.
          anchorCallsByName.clear();
          if (message.role === "assistant" && message.source === "output") {
            for (const part of message.parts) {
              if (part.type !== "tool-call") continue;
              // A repeated name cannot identify one call unambiguously.
              anchorCallsByName.set(
                part.toolName,
                anchorCallsByName.has(part.toolName) ? null : part,
              );
            }
          }
          continue;
        }
        if (
          message.source !== "output" ||
          !message.parts.length ||
          (!message.parts.every((part) => part.type === "text") &&
            !message.parts.every((part) => part.type === "data"))
        )
          continue;
        const observation = observationsByTraceAndId
          .get(message.traceId)
          ?.get(message.observationId);
        // Provenance must identify a TOOL; positional guessing cannot override it.
        if (observation?.type !== "TOOL" || !observation.name) continue;
        const call = anchorCallsByName.get(observation.name);
        if (!call) continue;
        if (!call.toolCallId) continue;
        if (explicitIds.has(call.toolCallId)) continue;
        if (callCounts.get(call.toolCallId) !== 1) continue;
        candidates.set(index, call);
        candidateCounts.set(
          call.toolCallId,
          (candidateCounts.get(call.toolCallId) ?? 0) + 1,
        );
      }
      return {
        ...thread,
        currentTurn: {
          ...thread.currentTurn,
          messages: messages.map((message, index) => {
            const call = candidates.get(index);
            if (!call?.toolCallId) return message;
            if (candidateCounts.get(call.toolCallId) !== 1) return message;
            const output = (() => {
              if (message.parts.every((part) => part.type === "text")) {
                return message.parts.map((part) => part.text).join("\n");
              }
              const values = message.parts.flatMap((part) =>
                part.type === "data" ? [part.value] : [],
              );
              return values.length === 1 ? values[0] : values;
            })();
            return {
              ...message,
              parts: [
                {
                  type: "tool-result" as const,
                  toolCallId: call.toolCallId,
                  toolName: call.toolName,
                  output,
                },
              ],
            };
          }),
        },
      };
    }),
  };
}
