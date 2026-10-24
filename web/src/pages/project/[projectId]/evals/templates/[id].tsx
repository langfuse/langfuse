import { EvalTemplateDetail } from "@/src/features/evals/components/EvalTemplateDetail";
import { RouteParamsPendingFallback } from "@/src/components/RouteParamsPendingFallback/RouteParamsPendingFallback";
import { useReadyRouteParams } from "@/src/hooks/useReadyRouteParams";

export default function EvalTemplateDetailPage() {
  const route = useReadyRouteParams(["projectId", "id"]);
  if (!route.ready) return <RouteParamsPendingFallback />;

  return (
    <EvalTemplateDetail
      projectId={route.params.projectId}
      templateId={route.params.id}
    />
  );
}
