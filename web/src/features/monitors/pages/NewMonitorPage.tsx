import { useRouter } from "next/router";

import Page from "@/src/components/layouts/page";
import { MonitorForm } from "@/src/features/monitors/components/MonitorForm";
import { MonitorPagePermissions } from "@/src/features/monitors/components/MonitorPagePermissions";
import { useTranslations } from "next-intl";

/** NewMonitorPage renders the create-monitor form for a project. */
export default function NewMonitorPage() {
  const t = useTranslations("operationsUi.monitors.pages");
  const router = useRouter();
  const projectId = router.query.projectId as string;

  return (
    <MonitorPagePermissions scope="alerts:CUD">
      <Page
        withPadding
        headerProps={{
          title: t("newAlert"),
          breadcrumb: [
            { name: t("alerts"), href: `/project/${projectId}/alerts` },
          ],
        }}
      >
        <MonitorForm projectId={projectId} />
      </Page>
    </MonitorPagePermissions>
  );
}
