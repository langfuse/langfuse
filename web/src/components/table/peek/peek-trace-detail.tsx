import { usePeekData } from "@/src/components/table/peek/hooks/usePeekData";
import { useTracePeekState } from "@/src/components/table/peek/hooks/useTracePeekState";
import { Trace } from "@/src/components/trace";
import { Skeleton } from "@/src/components/ui/skeleton";
import { StringParam, useQueryParam, withDefault } from "use-query-params";

export const PeekViewTraceDetail = ({ projectId }: { projectId: string }) => {
  const { peekId, timestamp } = useTracePeekState();
  const trace = usePeekData({
    projectId,
    traceId: peekId,
    timestamp,
  });

  const [selectedTab, setSelectedTab] = useQueryParam(
    "display",
    withDefault(StringParam, "details"),
  );

  return !peekId || !trace.data ? (
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
