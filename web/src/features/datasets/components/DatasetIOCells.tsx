import { api } from "@/src/utils/api";
import { cn } from "@/src/utils/tailwind";
import { MemoizedIOTableCell } from "@/src/components/ui/IOTableCell";
import { IOTableCell } from "@/src/components/ui/IOTableCell";

export const DatasetItemIOCell = ({
  projectId,
  datasetId,
  datasetItemId,
  io,
  singleLine = false,
}: {
  projectId: string;
  datasetId: string;
  datasetItemId: string;
  io: "expectedOutput" | "input";
  singleLine?: boolean;
}) => {
  const datasetItem = api.datasets.itemById.useQuery(
    {
      projectId: projectId,
      datasetId: datasetId,
      datasetItemId: datasetItemId,
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
    },
  );

  const data = observationId === undefined ? trace.data : observation.data;

  return (
    <MemoizedIOTableCell
      isLoading={
        (!!observationId ? observation.isLoading : trace.isLoading) || !data
      }
      data={io === "output" ? data?.output : data?.input}
      className={cn(io === "output" && "bg-accent-light-green")}
      singleLine={singleLine}
    />
  );
};
