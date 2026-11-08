import {
  assembleTranscript,
  getObservationByIdFromEventsTable,
  getObservationsForTraceFromEventsTable,
  MAX_OBSERVATIONS_PER_TRACE,
  orderObservations,
  normalizeIO,
  type Transcript,
} from "@langfuse/shared/src/server";
import { sessionTraceFilterSchema, type FilterState } from "@langfuse/shared";
import {
  toolCallPart,
  toolResultOutput,
  type NormalizedMessage,
} from "@langfuse/shared/src/utils/normalized-io";

/** Bound expensive I/O reads separately from lightweight observation structure. */
const MAX_TRANSCRIPT_OBSERVATIONS = 1_000;
const TRANSCRIPT_OBSERVATION_TYPES = new Set(["GENERATION", "TOOL"]);

type Observation = Awaited<
  ReturnType<typeof getObservationsForTraceFromEventsTable>
>["observations"][number];
type SessionTranscript = Omit<Transcript, "threads"> & {
  threads: Array<
    Omit<Transcript["threads"][number], "currentTurn"> & {
      currentTurn: Omit<
        Transcript["threads"][number]["currentTurn"],
        "messages"
      > & {
        messages: Array<
          Transcript["threads"][number]["currentTurn"]["messages"][number] & {
            level?: Observation["level"];
            statusMessage?: Observation["statusMessage"];
          }
        >;
      };
    }
  >;
};

/** Load observations in trace tree order and assemble their transcript. */
export async function loadTraceTranscript(
  trace: {
    projectId: string;
    traceId: string;
    /** Trace timestamp; observations from one hour before it onwards are read. */
    timestamp: Date;
    /** Use root observation I/O when no generation/tool transcript exists. */
    fallbackToRootIO?: boolean;
  } & (
    | { context: "session"; filter?: FilterState }
    | { context: "other"; filter?: never }
  ),
): Promise<{ transcript: SessionTranscript | null; cutoff: boolean }> {
  const { context, filter, ...source } = trace;
  const filters =
    context === "session" ? sessionTraceFilterSchema.parse(filter ?? []) : [];
  if (context === "session" && filters.length > 0) {
    const observationFilters = filters.filter((filter) =>
      ["name", "type", "level", "metadata", "isRootObservation"].includes(
        filter.column,
      ),
    );
    const content = await getObservationsForTraceFromEventsTable({
      ...source,
      filter: observationFilters,
      selectIOAndMetadata: true,
      limit: MAX_TRANSCRIPT_OBSERVATIONS,
    });
    const threads = [...content.observations]
      .sort(
        (a, b) =>
          a.startTime.getTime() - b.startTime.getTime() ||
          a.id.localeCompare(b.id),
      )
      .map((observation) => ({
        conversationHistory: [],
        currentTurn: {
          nestingLevel: 0,
          observations: [{ id: observation.id, traceId: trace.traceId }],
          messages: normalizeFilteredSessionObservation(observation).map(
            (message) => ({
              ...message,
              observationId: observation.id,
              traceId: trace.traceId,
              startTime: observation.startTime,
              endTime: observation.endTime,
              level: observation.level,
              statusMessage: observation.statusMessage,
            }),
          ),
        },
      }));
    return {
      transcript: threads.length > 0 ? { threads } : null,
      cutoff: content.totalCount > MAX_TRANSCRIPT_OBSERVATIONS,
    };
  }
  const [structure, content] = await Promise.all([
    getObservationsForTraceFromEventsTable(source),
    getObservationsForTraceFromEventsTable({
      ...source,
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
    if (withContent) {
      // Status-only executions still need a response row. Use normal assembly
      // matching without recovering IDs from metadata or inventing calls.
      if (
        withContent.type === "TOOL" &&
        (withContent.level === "ERROR" ||
          withContent.level === "WARNING" ||
          withContent.statusMessage) &&
        normalizeIO({
          kind: "io",
          io: {
            input: undefined,
            output: withContent.output,
            metadata: withContent.metadata,
          },
        }).messages.every((message) => message.parts.length === 0)
      ) {
        return [
          {
            ...withContent,
            output: {
              type: "tool-result",
              toolCallId: null,
              toolName: withContent.name,
              output: null,
              isError: withContent.level === "ERROR",
            },
          },
        ];
      }
      return [withContent];
    }
    return TRANSCRIPT_OBSERVATION_TYPES.has(o.type) ? [] : [o];
  });
  let transcript = assembleTranscript(orderObservations(observations));
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
  return {
    transcript: withToolObservationStatus(transcript, contentById),
    cutoff:
      structure.totalCount > MAX_OBSERVATIONS_PER_TRACE ||
      content.totalCount > MAX_TRANSCRIPT_OBSERVATIONS,
  };
}

function normalizeFilteredSessionObservation(
  observation: Observation,
): NormalizedMessage[] {
  const call =
    observation.type === "TOOL"
      ? toolCallPart({
          toolCallId: observation.id,
          toolName: observation.name,
          input: observation.input,
        })
      : null;
  const { messages } = normalizeIO({
    kind: "io",
    io: {
      input: call ? undefined : observation.input,
      output: observation.output,
      metadata: observation.metadata,
    },
  });
  if (observation.type !== "TOOL") return messages;

  const inputMessages: NormalizedMessage[] = call
    ? [{ role: "assistant", source: "input", parts: [call] }]
    : messages.filter((message) => message.source === "input");
  const outputMessages = messages.filter(
    (message) => message.source === "output",
  );
  const parts = outputMessages.flatMap((message) => message.parts);
  // Provider IDs belong to their own calls, not necessarily this outer tool.
  if (parts.some((part) => part.type === "tool-result" && part.toolCallId)) {
    return [...inputMessages, ...outputMessages];
  }
  const standaloneResult =
    parts.length === 1 && parts[0]!.type === "tool-result" ? parts[0]! : null;
  if (
    !standaloneResult &&
    parts.some(
      (part) => part.type === "tool-call" || part.type === "tool-result",
    )
  ) {
    return [...inputMessages, ...outputMessages];
  }
  const resultPart = standaloneResult
    ? {
        ...standaloneResult,
        toolCallId: observation.id,
        toolName: observation.name || standaloneResult.toolName,
        isError: observation.level === "ERROR" || standaloneResult.isError,
      }
    : {
        type: "tool-result" as const,
        toolCallId: observation.id,
        toolName: observation.name || undefined,
        output: toolResultOutput(parts, observation.output),
        isError: observation.level === "ERROR",
      };
  return [
    ...inputMessages,
    {
      ...outputMessages[0],
      role: "tool",
      source: "output",
      parts: [resultPart],
    },
  ];
}

function withToolObservationStatus(
  transcript: Transcript | null,
  observationsById: ReadonlyMap<string, Observation>,
): SessionTranscript | null {
  if (!transcript) return null;
  const hasToolStatus = [...observationsById.values()].some(
    (observation) =>
      observation.type === "TOOL" &&
      (observation.level !== undefined ||
        observation.statusMessage !== undefined),
  );
  if (!hasToolStatus) return transcript;
  return {
    ...transcript,
    threads: transcript.threads.map((thread) => ({
      ...thread,
      currentTurn: {
        ...thread.currentTurn,
        messages: thread.currentTurn.messages.map((message) => {
          const observation = observationsById.get(message.observationId);
          if (
            observation?.type !== "TOOL" ||
            observation.traceId !== message.traceId
          )
            return message;
          return {
            ...message,
            level: observation.level,
            statusMessage: observation.statusMessage,
          };
        }),
      },
    })),
  };
}
