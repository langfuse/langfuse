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
  const { peekId, timestamp } = useObservationPeekState("observations");
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

  return !peekId || !trace.data || row?.id !== peekId ? (
    <Skeleton className="h-full w-full" />
  ) : (
    <Trace
      key={trace.data.id}
      trace={trace.data}
      scores={trace.data.scores}
      projectId={trace.data.projectId}
      observations={trace.data.observations}
      selectedTab={selectedTab}
      setSelectedTab={setSelectedTab}
    />
  );
};
