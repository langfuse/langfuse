import ContainerPage from "@/src/components/layouts/container-page";
import { WebCalloutSettingsPage } from "@/src/features/web-callouts/components/WebCalloutSettingsPage";
import { useRouter } from "next/router";

export default function WebCalloutsSettings() {
  const router = useRouter();
  const projectId = router.query.projectId as string | undefined;

  if (!projectId) {
    return null;
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
