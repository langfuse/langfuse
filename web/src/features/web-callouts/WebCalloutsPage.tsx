import ContainerPage from "@/src/components/layouts/container-page";
import { StatusBadge } from "@/src/components/ui/StatusBadge/StatusBadge";
import { useWebCallouts } from "@/src/features/web-callouts/useWebCallouts";
import { WebCalloutSettingsPage } from "@/src/features/web-callouts/components/WebCalloutSettingsPage";
import { RouteParamsPendingFallback } from "@/src/hooks/useReadyRouteParams";
import { useRouter } from "next/router";

export default function WebCalloutsPage() {
  const router = useRouter();
  const projectId = router.query.projectId as string | undefined;
  const { status } = useWebCallouts(projectId);

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
        actionButtonsLeft: status && <StatusBadge type={status} />,
      }}
    >
      <WebCalloutSettingsPage projectId={projectId} />
    </ContainerPage>
  );
}
