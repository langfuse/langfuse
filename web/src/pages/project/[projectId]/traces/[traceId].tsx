import { useRouter } from "next/router";
import { TracePage } from "@/src/components/trace";
import { DateParam, useQueryParams, withDefault } from "use-query-params";

export default function Trace() {
  const router = useRouter();
  const traceId = decodeURIComponent(router.query.traceId as string);

  const timestamp =
    router.query.timestamp && typeof router.query.timestamp === "string"
      ? new Date(decodeURIComponent(router.query.timestamp))
      : undefined;

  console.log("timestamp", timestamp);

  return <TracePage traceId={traceId} timestamp={timestamp} />;
}
