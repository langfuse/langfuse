import { useRouter } from "next/router";
import { PeekViewObservationDetail } from "@/src/components/table/peek/peek-observation-detail";
import { MemoizedIOTableCell } from "@/src/components/ui/IOTableCell";
import { api } from "@/src/utils/api";

type ExperimentPeekViewProps = {
  projectId: string;
};

/**
 * Peek view component for experiment items that shows:
 * 1. Baseline output section at the top (fetched via URL params)
 * 2. Trace detail below
 *
 * Pattern: Matches EventsTable - reads baseline trace/observation IDs from URL
 * and fetches the output data via tRPC.
 */
export const ExperimentPeekView = ({ projectId }: ExperimentPeekViewProps) => {
  const router = useRouter();
  const peekId = router.query.peek as string | undefined;
  const baselineTraceId = router.query.baselineTraceId as string | undefined;
  const baselineObservationId = router.query.baselineObservationId as
    | string
    | undefined;

  // Fetch baseline observation output via tRPC
  const { data: baselineObservation, isLoading: isBaselineLoading } =
    api.observations.byId.useQuery(
      {
        observationId: baselineObservationId!,
        traceId: baselineTraceId!,
        projectId,
      },
      {
        enabled: Boolean(peekId && baselineTraceId && baselineObservationId),
      },
    );

  if (!peekId) {
    return null;
  }

  const baselineOutput = baselineObservation?.output;

  return (
    <div className="flex h-full flex-col">
      {/* Baseline output section - visible when available */}
      {(isBaselineLoading ||
        (baselineOutput !== null && baselineOutput !== undefined)) && (
        <div className="shrink-0 border-b p-4">
          <h3 className="text-muted-foreground mb-2 text-sm font-medium">
            Baseline Output
          </h3>
          <div className="bg-accent-light-green max-h-32 overflow-auto rounded border p-2">
            <MemoizedIOTableCell
              isLoading={isBaselineLoading}
              data={baselineOutput ?? null}
              singleLine={false}
            />
          </div>
        </div>
      )}

      {/* Trace detail */}
      <div className="min-h-0 flex-1 overflow-auto">
        <PeekViewObservationDetail projectId={projectId} />
      </div>
    </div>
  );
};
