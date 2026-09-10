import { TracePageSwitch } from "@/src/components/trace-detail-view-switch";
import { parseTraceTimestampFromQuery } from "@/src/fns/parseTraceTimestampFromQuery/parseTraceTimestampFromQuery";
import {
  RouteParamsPendingFallback,
  useReadyRouteParams,
} from "@/src/hooks/useReadyRouteParams";
import { useRouter } from "next/router";

export default function Trace() {
  const router = useRouter();
  const route = useReadyRouteParams(["projectId", "traceId"]);
  const timestamp = parseTraceTimestampFromQuery(router.query.timestamp);

  if (!route.ready) return <RouteParamsPendingFallback />;

  return (
    <TracePageSwitch
      projectId={route.params.projectId}
      traceId={route.params.traceId}
      timestamp={timestamp}
    />
  );
}
