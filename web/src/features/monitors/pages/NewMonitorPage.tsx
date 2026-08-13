import { useRouter } from "next/router";

import Page from "@/src/components/layouts/page";
import { MonitorForm } from "@/src/features/monitors/components/MonitorForm";
import { MonitorPagePermissions } from "@/src/features/monitors/components/MonitorPagePermissions";

/** NewMonitorPage renders the create-monitor form for a project. */
export default function NewMonitorPage() {
  const router = useRouter();
  const projectId = router.query.projectId as string;

  return (
    <MonitorPagePermissions scope="alerts:CUD">
      <Page
        withPadding
        headerProps={{
          title: "New Alert",
          breadcrumb: [
            { name: "Alerts", href: `/project/${projectId}/alerts` },
          ],
        }}
      >
        <MonitorForm projectId={projectId} />
      </Page>
    </MonitorPagePermissions>
  );
}
