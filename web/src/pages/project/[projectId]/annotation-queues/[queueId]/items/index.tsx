import { AnnotationQueuesItem } from "@/src/features/annotation-queues/components/AnnotationQueuesItem";
import { RouteParamsPendingFallback } from "@/src/components/RouteParamsPendingFallback/RouteParamsPendingFallback";
import { useReadyRouteParams } from "@/src/hooks/useReadyRouteParams";

export default function AnnotationQueues() {
  const route = useReadyRouteParams(["projectId", "queueId"]);

  if (!route.ready) return <RouteParamsPendingFallback />;

  return (
    <AnnotationQueuesItem
      annotationQueueId={route.params.queueId}
      projectId={route.params.projectId}
    />
  );
}
