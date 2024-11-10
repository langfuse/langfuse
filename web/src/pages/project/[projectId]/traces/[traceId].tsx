import { useRouter } from "next/router";
import { TracePage } from "@/src/components/trace";
import { DateParam, useQueryParams, withDefault } from "use-query-params";

export default function Trace() {
  const router = useRouter();
  const traceId = decodeURIComponent(router.query.traceId as string);

  console.log("timestamp", router.query.timestamp);

  const [timestampState] = useQueryParams({
    timestamp: withDefault(DateParam, undefined),
  });

  return <TracePage traceId={traceId} />;
}
