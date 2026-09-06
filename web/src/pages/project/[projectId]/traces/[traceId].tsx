import { TracePage } from "@/src/features/traces/TracePage";
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

  return <TracePage traceId={route.params.traceId} timestamp={timestamp} />;
}
