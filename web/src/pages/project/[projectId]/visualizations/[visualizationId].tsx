import { VisualizationEditor } from "@/src/features/custom-visualizations/components/VisualizationEditor";
import {
  RouteParamsPendingFallback,
  useReadyRouteParams,
} from "@/src/hooks/useReadyRouteParams";

export default function EditVisualizationPage() {
  const route = useReadyRouteParams(["projectId", "visualizationId"]);
  if (!route.ready) return <RouteParamsPendingFallback />;
  return (
    <VisualizationEditor
      projectId={route.params.projectId}
      visualizationId={route.params.visualizationId}
    />
  );
}
