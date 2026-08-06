import { TracePage } from "@/src/features/traces/TracePage";
import { parseTraceTimestampFromQuery } from "@/src/fns/parseTraceTimestampFromQuery/parseTraceTimestampFromQuery";
import { useRouter } from "next/router";

export default function Trace() {
  const router = useRouter();
  const traceId = router.query.traceId as string;
  const timestamp = parseTraceTimestampFromQuery(router.query.timestamp);

  return <TracePage traceId={traceId} timestamp={timestamp} />;
}
