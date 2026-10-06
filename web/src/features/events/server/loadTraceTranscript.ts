import {
  assembleTranscript,
  getObservationsForTraceFromEventsTable,
  MAX_OBSERVATIONS_PER_TRACE,
  orderObservations,
  type Transcript,
} from "@langfuse/shared/src/server";
import type { ToolCallPart } from "@langfuse/shared/src/utils/normalized-io";

/** Generations and tools whose I/O one transcript reads at most. */
const MAX_TRANSCRIPT_OBSERVATIONS = 1_000;

const TRANSCRIPT_OBSERVATION_TYPES = new Set(["GENERATION", "TOOL"]);

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
   * For session rendering, convert text-only TOOL responses into ID-bearing
   * tool results when observation names uniquely identify their calls.
   * Ambiguous responses remain unchanged. Disabled by default.
   */
  pairTextToolResponses?: boolean;
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
  let transcript = assembleTranscript(orderObservations(observations));
  // TODO: Evaluate moving general pairing into shared transcript assembly once
  // it preserves resolved call identity for text-only tool responses.
  if (trace.pairTextToolResponses && transcript) {
    transcript = {
      ...transcript,
      threads: transcript.threads.map((thread) => {
        const messages = thread.currentTurn.messages;
        const calls = messages.flatMap((message) =>
          message.parts.filter(
            (part): part is ToolCallPart => part.type === "tool-call",
          ),
        );
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
        let anchor: (typeof messages)[number] | undefined;
        for (const [index, message] of messages.entries()) {
          if (message.role !== "tool") {
            anchor =
              message.role === "assistant" && message.source === "output"
                ? message
                : undefined;
            continue;
          }
          if (
            message.source !== "output" ||
            !message.parts.length ||
            !message.parts.every((part) => part.type === "text")
          )
            continue;
          const observation = observations.find(
            (o) =>
              o.id === message.observationId && o.traceId === message.traceId,
          );
          // Provenance must identify a TOOL; positional guessing cannot override it.
          if (observation?.type !== "TOOL" || !observation.name || !anchor)
            continue;
          const matches = anchor.parts.filter(
            (part): part is ToolCallPart =>
              part.type === "tool-call" && part.toolName === observation.name,
          );
          if (matches.length !== 1) continue;
          const call = matches[0]!;
          if (
            !call.toolCallId ||
            explicitIds.has(call.toolCallId) ||
            calls.filter((other) => other.toolCallId === call.toolCallId)
              .length !== 1
          )
            continue;
          candidates.set(index, call);
        }
        return {
          ...thread,
          currentTurn: {
            ...thread.currentTurn,
            messages: messages.map((message, index) => {
              const call = candidates.get(index);
              if (
                !call ||
                [...candidates.values()].filter(
                  (other) => other.toolCallId === call.toolCallId,
                ).length !== 1
              )
                return message;
              return {
                ...message,
                parts: [
                  {
                    type: "tool-result" as const,
                    toolCallId: call.toolCallId,
                    toolName: call.toolName,
                    output: message.parts
                      .map((part) => (part.type === "text" ? part.text : ""))
                      .join("\n"),
                  },
                ],
              };
            }),
          },
        };
      }),
    };
  }
  return {
    transcript,
    cutoff:
      structure.totalCount > MAX_OBSERVATIONS_PER_TRACE ||
      content.totalCount > MAX_TRANSCRIPT_OBSERVATIONS,
  };
}
