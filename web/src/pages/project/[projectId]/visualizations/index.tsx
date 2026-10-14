import { VisualizationLibrary } from "@/src/features/custom-visualizations/components/VisualizationLibrary";
import { ErrorPage } from "@/src/components/error-page";
import { useIsFeatureEnabled } from "@/src/features/feature-flags";
import {
  RouteParamsPendingFallback,
  useReadyRouteParams,
} from "@/src/hooks/useReadyRouteParams";

export default function VisualizationStudioPage() {
  const route = useReadyRouteParams(["projectId"]);
  const customUiEnabled = useIsFeatureEnabled("customUi");
  if (!route.ready) return <RouteParamsPendingFallback />;
  if (!customUiEnabled) {
    return (
      <ErrorPage title="Not found" message="This page is not available." />
    );
  }
  return <VisualizationLibrary projectId={route.params.projectId} />;
}
