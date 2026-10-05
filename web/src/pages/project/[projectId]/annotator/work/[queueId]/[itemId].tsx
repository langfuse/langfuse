import { AnnotatorWorkbench } from "@/src/features/annotator/components/AnnotatorWorkbench";
import {
  RouteParamsPendingFallback,
  useReadyRouteParams,
} from "@/src/hooks/useReadyRouteParams";

export default function AnnotatorWorkPage() {
  const route = useReadyRouteParams(["projectId", "queueId", "itemId"]);
  if (!route.ready) return <RouteParamsPendingFallback />;
  return (
    <AnnotatorWorkbench
      projectId={route.params.projectId}
      queueId={route.params.queueId}
      itemId={route.params.itemId}
    />
  );
}
