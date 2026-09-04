import { type FilterState } from "@langfuse/shared";

import { SessionConversationTimeline } from "@/src/components/session/SessionConversationTimeline";
import { type EventSessionTrace } from "@/src/components/session/sessionDetailPageTypes";
import { api, sendAsPostOption, type RouterOutputs } from "@/src/utils/api";

const BATCH_IO_SIZE = 100;

type EventObservation = RouterOutputs["events"]["all"]["observations"][number];

export function ConnectedSessionConversationTimeline({
  trace,
  turnNumber,
  idleGapSeconds,
  projectId,
  observations,
  filterState,
  viewLabel,
  showSystemPrompt,
  openPeek,
}: {
  trace: EventSessionTrace;
  turnNumber: number;
  idleGapSeconds: number | null;
  projectId: string;
  observations: EventObservation[] | null | undefined;
  filterState: FilterState;
  viewLabel: string | null;
  showSystemPrompt: boolean;
  openPeek: (
    id: string,
    row: EventSessionTrace & { observationId?: string },
  ) => void;
}) {
  const batches: EventObservation[][] = [];
  for (
    let index = 0;
    index < (observations?.length ?? 0);
    index += BATCH_IO_SIZE
  ) {
    batches.push(observations!.slice(index, index + BATCH_IO_SIZE));
  }

  const ioQueries = api.useQueries((t) =>
    batches.map((batch) =>
      t.events.batchIO(
        {
          projectId,
          traceId: trace.id,
          observations: batch.map((observation) => ({
            id: observation.id,
            traceId: trace.id,
          })),
          minStartTime: batch[0]!.startTime,
          maxStartTime: batch.at(-1)!.startTime,
          truncated: false,
          ioCharLimit: 10_000,
        },
        {
          ...sendAsPostOption,
          staleTime: 60 * 1000,
          refetchOnWindowFocus: false,
        },
      ),
    ),
  );
  const isFetching = ioQueries.some((query) => query.isFetching);
  const isError = ioQueries.some((query) => query.isError);
  const allIOResolved = ioQueries.every((query) => !query.isPending);
  const ioByObservationId = new Map(
    ioQueries.flatMap((query) => query.data ?? []).map((io) => [io.id, io]),
  );
  const hydratedObservations = (observations ?? []).flatMap((observation) => {
    const io = ioByObservationId.get(observation.id);
    if (!io && !allIOResolved) return [];

    return [
      {
        ...observation,
        input: io?.input ?? null,
        output: io?.output ?? null,
        metadata: io?.metadata ?? null,
      },
    ];
  });

  const state =
    observations === undefined ||
    (isFetching && hydratedObservations.length === 0)
      ? ({ type: "loading" } as const)
      : observations === null || isError
        ? ({ type: "error" } as const)
        : observations.length > 0
          ? ({ type: "loaded", observations: hydratedObservations } as const)
          : ({
              type: "empty",
              message:
                filterState.length === 0
                  ? "This trace has no observations."
                  : viewLabel
                    ? `No observation matches the “${viewLabel}” view in this trace.`
                    : "No observation matches the current filters in this trace.",
            } as const);

  return (
    <SessionConversationTimeline
      trace={trace}
      turnNumber={turnNumber}
      idleGapSeconds={idleGapSeconds}
      state={state}
      showSystemPrompt={showSystemPrompt}
      onOpenTrace={() => openPeek(trace.id, trace)}
      onOpenObservation={(observationId) =>
        openPeek(trace.id, { ...trace, observationId })
      }
    />
  );
}
