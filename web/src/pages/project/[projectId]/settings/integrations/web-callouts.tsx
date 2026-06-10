import { ErrorPage } from "@/src/components/error-page";
import ContainerPage from "@/src/components/layouts/container-page";
import { WebCalloutSettingsPage } from "@/src/features/web-callouts/components/WebCalloutSettingsPage";
import { api } from "@/src/utils/api";
import { useRouter } from "next/router";

export default function WebCalloutsSettings() {
  const router = useRouter();
  const projectId = router.query.projectId as string | undefined;
  const availability = api.webCallouts.availability.useQuery(
    { projectId: projectId ?? "" },
    { enabled: Boolean(projectId), staleTime: 60_000 },
  );

  if (!projectId || availability.isPending) {
    return null;
  }

  if (availability.data?.enabled !== true) {
    return (
      <ErrorPage title="Page not found" message="This page does not exist." />
    );
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
