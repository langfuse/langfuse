import ContainerPage from "@/src/app/shell/layouts/container-page";
import { WebCalloutSettingsPage } from "@/src/integrations/web-callouts/components/WebCalloutSettingsPage";
import { RouteParamsPendingFallback } from "@/src/app/hooks/useReadyRouteParams";
import { useRouter } from "next/router";

export default function WebCalloutsPage() {
  const router = useRouter();
  const projectId = router.query.projectId as string | undefined;

  if (!projectId) {
    return <RouteParamsPendingFallback />;
  }

  return (
    <ContainerPage
      headerProps={{
        title: "Web Callouts",
        breadcrumb: [
          { name: "Settings", href: `/project/${projectId}/settings` },
        ],
      }}
    >
      <WebCalloutSettingsPage projectId={projectId} />
    </ContainerPage>
  );
}
