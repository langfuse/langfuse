import { useRouter } from "next/router";
import { useState } from "react";

import { ErrorPage } from "@/src/components/error-page";
import Page from "@/src/components/layouts/page";
import { MonitorForm } from "@/src/features/monitors/components/MonitorForm";
import { MonitorPagePermissions } from "@/src/features/monitors/components/MonitorPagePermissions";
import { api, type APIError } from "@/src/utils/api";
import { type Monitor } from "@langfuse/shared/monitors";

/** EditMonitorPage gates the edit-monitor route and defers all data fetching to EditMonitorPageContent so blocked users never trigger the monitor query. */
export default function EditMonitorPage() {
  return (
    <MonitorPagePermissions scope="monitors:read">
      <EditMonitorPageRouter />
    </MonitorPagePermissions>
  );
}

/** EditMonitorPageRouter fetches data and renders loading, error and editor pages based on the state of the query */
function EditMonitorPageRouter() {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const monitorId = router.query.monitorId as string;

  const { data, error, isPending } = api.monitors.get.useQuery(
    { projectId, id: monitorId },
    { enabled: Boolean(monitorId) },
  );

  if (isPending) {
    return <EditMonitorLoadingPage projectId={projectId} />;
  }

  if (error) {
    return <GetMonitorErrorPage error={error} />;
  }

  return <EditMonitorFormPage monitor={data} />;
}

/** EditMonitorFormPage renders the edit monitors form */
const EditMonitorFormPage = ({ monitor }: { monitor: Monitor }) => {
  const [liveName, setLiveName] = useState(monitor.name);

  return (
    <Page withPadding headerProps={getHeaderProps(monitor.projectId, liveName)}>
      <MonitorForm
        projectId={monitor.projectId}
        monitor={monitor}
        onNameChange={setLiveName}
      />
    </Page>
  );
};

/** GetMonitorErrorPage renders the error message returned by the api.monitors.get method */
const GetMonitorErrorPage = ({ error }: { error: APIError }) => {
  if (error?.data?.code == "NOT_FOUND") {
    return (
      <ErrorPage
        title="Monitor not found"
        message="This monitor doesn't exist or has been deleted."
      />
    );
  }

  return (
    <ErrorPage title="Monitor could not be edited" message={error.message} />
  );
};

/** EditMonitorLoadingPage renders a loading page while the monitor is loading */
const EditMonitorLoadingPage = ({ projectId }: { projectId: string }) => (
  <Page withPadding headerProps={getHeaderProps(projectId)}>
    <></>
  </Page>
);

/** getHeaderProps returns the page header properties for the EditMonitors page */
const getHeaderProps = (projectId: string, monitorName?: string) => ({
  title: `Edit Monitor${monitorName ? " - " + monitorName : ""}`,
  breadcrumb: [{ name: "Monitors", href: `/project/${projectId}/monitors` }],
});
