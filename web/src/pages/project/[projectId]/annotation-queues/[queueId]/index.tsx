import QueueItems from "@/src/features/annotation-queues/pages/QueueItems";
import { RouteParamsPendingFallback } from "@/src/components/RouteParamsPendingFallback/RouteParamsPendingFallback";
import { useReadyRouteParams } from "@/src/hooks/useReadyRouteParams";

export default function AnnotationQueueItemsPage() {
  const route = useReadyRouteParams(["projectId", "queueId"]);

  if (!route.ready) return <RouteParamsPendingFallback />;

  return (
    <QueueItems
      projectId={route.params.projectId}
      queueId={route.params.queueId}
    />
  );
}
