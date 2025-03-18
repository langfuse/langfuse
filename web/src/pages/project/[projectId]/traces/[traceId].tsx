import { TracePage } from "@/src/components/trace/TracePage";
import { useRouter } from "next/router";

export default function Trace() {
  const router = useRouter();
  const traceId = router.query.traceId as string;

  const timestamp =
    router.query.timestamp && typeof router.query.timestamp === "string"
      ? new Date(decodeURIComponent(router.query.timestamp))
      : undefined;

  return <TracePage traceId={traceId} timestamp={timestamp} />;
}
