import { api } from "@/src/utils/api";
import { cn } from "@/src/utils/tailwind";
import { MemoizedIOTableCell } from "@/src/components/ui/IOTableCell";
import { IOTableCell } from "@/src/components/ui/IOTableCell";
import { useTrpcError } from "@/src/hooks/useTrpcError";
import { NotFoundCard } from "@/src/features/datasets/components/NotFoundCard";

export const DatasetItemIOCell = ({
  projectId,
  datasetId,
  datasetItemId,
  io,
  datasetItemVersion,
  singleLine = false,
}: {
  projectId: string;
  datasetId: string;
  datasetItemId: string;
  io: "expectedOutput" | "input";
  datasetItemVersion?: Date;
  singleLine?: boolean;
}) => {
  const datasetItem = api.datasets.itemById.useQuery(
    {
      projectId: projectId,
      datasetId: datasetId,
      datasetItemId: datasetItemId,
      version: datasetItemVersion,
    },
    {
      trpc: {
        context: {
          skipBatch: true,
        },
      },
      refetchOnMount: false, // prevents refetching loops
    },
  );

  return (
    <IOTableCell
      isLoading={datasetItem.isLoading}
      data={
        io === "expectedOutput"
          ? datasetItem.data?.expectedOutput
          : datasetItem.data?.input
      }
      singleLine={singleLine}
    />
  );
};

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

  return isSilentError ? (
    <NotFoundCard
      itemType={!!observationId ? "observation" : "trace"}
      singleLine={singleLine}
    />
  ) : (
    <MemoizedIOTableCell
      isLoading={isLoading || !data}
      data={io === "output" ? data?.output : data?.input}
      className={cn(io === "output" && "bg-accent-light-green")}
      singleLine={singleLine}
    />
  );
};
