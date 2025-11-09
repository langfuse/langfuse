import { useRouter } from "next/router";
import { Trace } from "@/src/components/trace";
import { Skeleton } from "@/src/components/ui/skeleton";
import { StringParam, useQueryParam, withDefault } from "use-query-params";
import { api } from "@/src/utils/api";
import { type ObservationReturnTypeWithMetadata } from "@/src/server/api/routers/traces";

export const PeekViewObservationDetailNew = ({
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

  const [selectedTab, setSelectedTab] = useQueryParam(
    "display",
    withDefault(StringParam, "details"),
  );

  const observations = api.events.all.useQuery({
    projectId,
    filter: [
      {
        column: "traceId",
        operator: "=" as const,
        value: traceId ?? "",
        type: "string" as const,
      },
      ...(timestamp
        ? [
            {
              column: "startTime",
              operator: "<=" as const,
              value: new Date(timestamp.getTime() + 30 * 24 * 60 * 60 * 1000),
              type: "datetime" as const,
            },
            {
              column: "startTime",
              operator: ">=" as const,
              value: new Date(timestamp.getTime() - 30 * 24 * 60 * 60 * 1000),
              type: "datetime" as const,
            },
          ]
        : []),
    ],
    searchQuery: null,
    searchType: ["id"],
    orderBy: null,
    page: 0,
    limit: 10000,
  });

  const scores = api.scores.all.useQuery({
    projectId,
    filter: [
      {
        column: "traceId",
        operator: "=" as const,
        value: traceId ?? "",
        type: "string" as const,
      },
    ],
    orderBy: null,
    page: 0,
    limit: 100,
  });

  if (!peekId || !observations.data) {
    return <Skeleton className="h-full w-full" />;
  }

  if (!traceId) {
    return <div>Trace not found</div>;
  }

  return (
    <Trace
      key={`${traceId}-${peekId}`}
      traceId={traceId}
      trace={undefined}
      scores={scores.data?.scores ?? []}
      projectId={projectId}
      observations={observations.data.observations}
      selectedTab={selectedTab}
      setSelectedTab={setSelectedTab}
      context="peek"
    />
  );
};
