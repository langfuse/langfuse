import { Trace2Page } from "@/src/components/trace2/Trace2Page";
import { useRouter } from "next/router";

export default function Trace2() {
  const router = useRouter();
  const traceId = router.query.traceId as string;

  const timestamp =
    router.query.timestamp && typeof router.query.timestamp === "string"
      ? new Date(decodeURIComponent(router.query.timestamp))
      : undefined;

  return <Trace2Page traceId={traceId} timestamp={timestamp} />;
}
