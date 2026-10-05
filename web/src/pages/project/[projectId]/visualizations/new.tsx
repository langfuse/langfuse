import { VisualizationStudio } from "@/src/features/custom-visualizations/components/VisualizationStudio";
import {
  RouteParamsPendingFallback,
  useReadyRouteParams,
} from "@/src/hooks/useReadyRouteParams";

export default function NewVisualizationPage() {
  const route = useReadyRouteParams(["projectId"]);
  if (!route.ready) return <RouteParamsPendingFallback />;
  return (
    <VisualizationStudio projectId={route.params.projectId} mode="create" />
  );
}
