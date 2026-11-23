import { api } from "@/src/utils/api";
import { ConnectedIOTableCell } from "@/src/components/table/ConnectedIOTableCell";
import { useBoundRowHeightIO } from "@/src/components/table/data-table-row-height-switch";
import { useTrpcError } from "@/src/hooks/useTrpcError";
import { NotFoundCard } from "@/src/features/datasets/components/NotFoundCard";

const silentHttpCodes = [404];

export const TraceObservationIOCell = ({
  traceId,
  projectId,
  observationId,
  io,
  fromTimestamp,
  singleLine = false,
}: {
  traceId: string;
  projectId: string;
  observationId?: string;
  io: "input" | "output";
  fromTimestamp: Date;
  singleLine?: boolean;
}) => {
  const bound = useBoundRowHeightIO(true, singleLine, false);
  // Subtract 1 day from the fromTimestamp as a buffer in case the trace happened before the run
  const fromTimestampModified = new Date(
    fromTimestamp.getTime() - 24 * 60 * 60 * 1000,
  );

  // conditionally fetch the trace or observation depending on the presence of observationId
  const trace = api.traces.byId.useQuery(
    { traceId, projectId, fromTimestamp: fromTimestampModified },
    {
      enabled: observationId === undefined,
      refetchOnMount: false, // prevents refetching loops
      staleTime: 60 * 1000, // 1 minute
      meta: { silentHttpCodes },
    },
  );
  const observation = api.observations.byId.useQuery(
    {
      observationId: observationId as string, // disabled when observationId is undefined
      projectId,
      traceId,
    },
    {
      enabled: observationId !== undefined,
      refetchOnMount: false, // prevents refetching loops
      staleTime: 60 * 1000, // 1 minute
      meta: { silentHttpCodes },
    },
  );

  const isLoading = !!observationId ? observation.isLoading : trace.isLoading;

  const { isSilentError } = useTrpcError(
    !!observationId ? observation.error : trace.error,
    silentHttpCodes,
  );

  const data = observationId === undefined ? trace.data : observation.data;

  if (isSilentError) {
    return (
      <NotFoundCard
        itemType={!!observationId ? "observation" : "trace"}
        singleLine={bound.singleLine}
      />
    );
  }

  if (isLoading || !data) {
    return <ConnectedIOTableCell isLoading singleLine={bound.singleLine} />;
  }

  return (
    <ConnectedIOTableCell
      data={io === "output" ? data.output : data.input}
      singleLine={bound.singleLine}
    />
  );
};
