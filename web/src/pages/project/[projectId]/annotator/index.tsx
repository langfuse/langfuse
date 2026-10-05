import { AnnotatorHome } from "@/src/features/annotator/components/AnnotatorHome";
import {
  RouteParamsPendingFallback,
  useReadyRouteParams,
} from "@/src/hooks/useReadyRouteParams";

export default function AnnotatorPage() {
  const route = useReadyRouteParams(["projectId"]);
  if (!route.ready) return <RouteParamsPendingFallback />;
  return <AnnotatorHome projectId={route.params.projectId} />;
}
