import ContainerPage from "@/src/components/layouts/container-page";
import { WebCallbackSettingsPage } from "@/src/features/web-callbacks/components/WebCallbackSettingsPage";
import { useRouter } from "next/router";

export default function WebCallbacksSettings() {
  const router = useRouter();
  const projectId = router.query.projectId as string | undefined;

  if (!projectId) {
    return null;
  }

  return (
    <ContainerPage
      headerProps={{
        title: "Web Callbacks",
        breadcrumb: [
          { name: "Settings", href: `/project/${projectId}/settings` },
        ],
      }}
    >
      <WebCallbackSettingsPage projectId={projectId} />
    </ContainerPage>
  );
}
