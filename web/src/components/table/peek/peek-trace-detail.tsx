import { usePeekData } from "@/src/components/table/peek/hooks/usePeekData";
import { useTracePeekState } from "@/src/components/table/peek/hooks/useTracePeekState";
import { Trace } from "@/src/components/trace";
import { Skeleton } from "@/src/components/ui/skeleton";

export const PeekViewTraceDetail = ({ projectId }: { projectId: string }) => {
  const { peekId, timestamp } = useTracePeekState("traces");
  const trace = usePeekData({
    projectId,
    traceId: peekId,
    timestamp,
  });

  return !peekId || !trace.data ? (
    <Skeleton className="h-full w-full" />
  ) : (
    <Trace
      key={trace.data.id}
      trace={trace.data}
      scores={trace.data.scores}
      projectId={trace.data.projectId}
      observations={trace.data.observations}
    />
  );
};
