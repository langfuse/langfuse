import ContainerPage from "@/src/components/layouts/container-page";
import { WebCalloutSettingsPage } from "@/src/features/web-callouts/components/WebCalloutSettingsPage";
import { useRouter } from "next/router";
import { useTranslations } from "next-intl";

export default function WebCalloutsSettings() {
  const t = useTranslations("integrationsSettings");
  const router = useRouter();
  const projectId = router.query.projectId as string | undefined;

  if (!projectId) {
    return null;
  }

  return (
    <ContainerPage
      headerProps={{
        title: t("webCallouts.title"),
        breadcrumb: [
          {
            name: t("common.settings"),
            href: `/project/${projectId}/settings`,
          },
        ],
      }}
    >
      <WebCalloutSettingsPage projectId={projectId} />
    </ContainerPage>
  );
}
