import { AnnotatorStudio } from "@/src/features/annotator/components/AnnotatorStudio";
import {
  RouteParamsPendingFallback,
  useReadyRouteParams,
} from "@/src/hooks/useReadyRouteParams";

export default function AnnotatorStudioPage() {
  const route = useReadyRouteParams(["projectId"]);
  if (!route.ready) return <RouteParamsPendingFallback />;
  return <AnnotatorStudio projectId={route.params.projectId} />;
}
