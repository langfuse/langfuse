import { VisualizationStudio } from "@/src/features/custom-visualizations/components/VisualizationStudio";
import { ErrorPage } from "@/src/components/error-page";
import { useIsFeatureEnabled } from "@/src/features/feature-flags";
import {
  RouteParamsPendingFallback,
  useReadyRouteParams,
} from "@/src/hooks/useReadyRouteParams";

export default function NewVisualizationPage() {
  const route = useReadyRouteParams(["projectId"]);
  const customUiEnabled = useIsFeatureEnabled("customUi");
  if (!route.ready) return <RouteParamsPendingFallback />;
  if (!customUiEnabled) {
    return (
      <ErrorPage title="Not found" message="This page is not available." />
    );
  }
  return (
    <VisualizationStudio projectId={route.params.projectId} mode="create" />
  );
}
