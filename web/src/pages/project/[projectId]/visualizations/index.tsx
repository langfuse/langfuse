import { VisualizationLibrary } from "@/src/features/custom-visualizations/components/VisualizationLibrary";
import {
  RouteParamsPendingFallback,
  useReadyRouteParams,
} from "@/src/hooks/useReadyRouteParams";

export default function VisualizationStudioPage() {
  const route = useReadyRouteParams(["projectId"]);
  if (!route.ready) return <RouteParamsPendingFallback />;
  return <VisualizationLibrary projectId={route.params.projectId} />;
}
