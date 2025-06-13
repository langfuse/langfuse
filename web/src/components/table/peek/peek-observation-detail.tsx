import { useObservationPeekState } from "@/src/components/table/peek/hooks/useObservationPeekState";
import { usePeekData } from "@/src/components/table/peek/hooks/usePeekData";
import { type ObservationsTableRow } from "@/src/components/table/use-cases/observations";
import { Trace } from "@/src/components/trace";
import { Skeleton } from "@/src/components/ui/skeleton";
import { StringParam, useQueryParam, withDefault } from "use-query-params";

export const PeekViewObservationDetail = ({
  projectId,
  row,
}: {
  projectId: string;
  row?: ObservationsTableRow;
}) => {
  const { peekId, timestamp } = useObservationPeekState();
  const effectiveTimestamp = row?.timestamp ?? timestamp;

  const trace = usePeekData({
    projectId,
    traceId: row?.traceId,
    timestamp: effectiveTimestamp,
  });

  const [selectedTab, setSelectedTab] = useQueryParam(
    "display",
    withDefault(StringParam, "details"),
  );

  if (!peekId || !row?.traceId || !trace.data || row.id !== peekId) {
    return <Skeleton className="h-full w-full" />;
  }

  return (
    <Trace
      key={`${trace.data.id}-${peekId}`}
      trace={trace.data}
      scores={trace.data.scores}
      projectId={trace.data.projectId}
      observations={trace.data.observations}
      selectedTab={selectedTab}
      setSelectedTab={setSelectedTab}
    />
  );
};
