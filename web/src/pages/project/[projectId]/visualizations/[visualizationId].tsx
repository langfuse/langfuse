import { VisualizationEditor } from "@/src/features/custom-visualizations/components/VisualizationEditor";
import { ErrorPage } from "@/src/components/error-page";
import { useIsFeatureEnabled } from "@/src/features/feature-flags";
import {
  RouteParamsPendingFallback,
  useReadyRouteParams,
} from "@/src/hooks/useReadyRouteParams";

export default function EditVisualizationPage() {
  const route = useReadyRouteParams(["projectId", "visualizationId"]);
  const customUiEnabled = useIsFeatureEnabled("customUi");
  if (!route.ready) return <RouteParamsPendingFallback />;
  if (!customUiEnabled) {
    return (
      <ErrorPage title="Not found" message="This page is not available." />
    );
  }
  return (
    <VisualizationEditor
      projectId={route.params.projectId}
      visualizationId={route.params.visualizationId}
    />
  );
}
