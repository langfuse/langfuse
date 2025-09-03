import { useObservationPeekState } from "@/src/components/table/peek/hooks/useObservationPeekState";
import { usePeekData } from "@/src/components/table/peek/hooks/usePeekData";
import { Trace } from "@/src/components/trace";
import { Skeleton } from "@/src/components/ui/skeleton";
import { StringParam, useQueryParam, withDefault } from "use-query-params";

export const PeekViewObservationDetail = ({
  projectId,
}: {
  projectId: string;
}) => {
  const { peekId, timestamp, traceId } = useObservationPeekState();

  const trace = usePeekData({
    projectId,
    traceId,
    timestamp,
  });

  const [selectedTab, setSelectedTab] = useQueryParam(
    "display",
    withDefault(StringParam, "details"),
  );

  if (!peekId || !trace.data) {
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
