import { useRouter } from "next/router";
import { usePeekData } from "@/src/components/table/peek/hooks/usePeekData";
import { Trace } from "@/src/components/trace2/Trace";
import { Skeleton } from "@/src/components/ui/skeleton";
import { StringParam, useQueryParam, withDefault } from "use-query-params";

export const PeekViewObservationDetail = ({
  projectId,
}: {
  projectId: string;
}) => {
  const router = useRouter();
  const peekId = router.query.peek as string | undefined;
  const timestamp = router.query.timestamp
    ? new Date(router.query.timestamp as string)
    : undefined;
  const traceId = router.query.traceId as string | undefined;

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
    return <Skeleton className="h-full w-full rounded-none" />;
  }

  return (
    <Trace
      key={`${trace.data.id}-${peekId}`}
      trace={trace.data}
      scores={trace.data.scores}
      corrections={trace.data.corrections}
      projectId={trace.data.projectId}
      observations={trace.data.observations}
      selectedTab={selectedTab}
      setSelectedTab={setSelectedTab}
      context="peek"
    />
  );
};
