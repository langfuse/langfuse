import { useRouter } from "next/router";
import { useState } from "react";

import { ErrorPage } from "@/src/components/error-page";
import Page from "@/src/components/layouts/page";
import { DeleteMonitorButton } from "@/src/features/monitors/components/DeleteMonitorButton";
import { MonitorForm } from "@/src/features/monitors/components/MonitorForm";
import { MonitorPagePermissions } from "@/src/features/monitors/components/MonitorPagePermissions";
import { invalidateMonitorQueriesAfterDelete } from "@/src/features/monitors/fns/invalidateMonitorQueriesAfterDelete";
import { showErrorToast, showSuccessToast } from "@/src/features/notifications";
import { useHasProjectAccess } from "@/src/features/rbac";
import { api, type APIError } from "@/src/utils/api";
import { type Monitor } from "@langfuse/shared/monitors";

/** EditMonitorPage gates the edit-monitor route and defers all data fetching to EditMonitorPageContent so blocked users never trigger the monitor query. */
export default function EditMonitorPage() {
  return (
    <MonitorPagePermissions scope="alerts:read">
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
  const router = useRouter();
  const utils = api.useUtils();
  const [liveName, setLiveName] = useState(monitor.name);
  const canDelete = useHasProjectAccess({
    projectId: monitor.projectId,
    scope: "alerts:CUD",
  });
  const deleteMonitor = api.monitors.delete.useMutation({
    onSuccess: async () => {
      await invalidateMonitorQueriesAfterDelete(utils.monitors);
      showSuccessToast({
        title: "Alert deleted",
        description: `"${monitor.name}" has been deleted.`,
      });
      await router.replace(`/project/${monitor.projectId}/alerts`);
    },
    onError: (error) => showErrorToast("Failed to delete alert", error.message),
  });

  return (
    <Page
      withPadding
      headerProps={{
        ...getHeaderProps(monitor.projectId, liveName),
        actionButtonsRight: canDelete ? (
          <DeleteMonitorButton
            monitorName={monitor.name}
            deleting={deleteMonitor.isPending}
            onDelete={async () => {
              await deleteMonitor.mutateAsync({
                projectId: monitor.projectId,
                id: monitor.id,
              });
            }}
          />
        ) : undefined,
      }}
    >
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
        title="Alert not found"
        message="This alert doesn't exist or has been deleted."
      />
    );
  }

  return (
    <ErrorPage title="Alert could not be edited" message={error.message} />
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
  title: `Edit Alert${monitorName ? " - " + monitorName : ""}`,
  breadcrumb: [{ name: "Alerts", href: `/project/${projectId}/alerts` }],
});
