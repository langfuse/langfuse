import { TracePage } from "@/src/components/trace/TracePage";
import { ScoreCacheProvider } from "@/src/features/scores/contexts/ScoreCacheContext";
import { useRouter } from "next/router";

export default function Trace() {
  const router = useRouter();
  const traceId = router.query.traceId as string;

  const timestamp =
    router.query.timestamp && typeof router.query.timestamp === "string"
      ? new Date(decodeURIComponent(router.query.timestamp))
      : undefined;

  return (
    <ScoreCacheProvider>
      <TracePage traceId={traceId} timestamp={timestamp} />
    </ScoreCacheProvider>
  );
}
