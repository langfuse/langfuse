import { useRouter } from "next/router";
import { useState } from "react";

import { ErrorPage } from "@/src/components/error-page";
import Page from "@/src/components/layouts/page";
import { MonitorForm } from "@/src/features/monitors/components/MonitorForm";
import { MonitorPagePermissions } from "@/src/features/monitors/components/MonitorPagePermissions";
import { api, type APIError } from "@/src/utils/api";
import { type Monitor } from "@langfuse/shared/monitors";
import { useTranslations } from "next-intl";

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
  const t = useTranslations("operationsUi.monitors.pages");
  const [liveName, setLiveName] = useState(monitor.name);

  return (
    <Page
      withPadding
      headerProps={getHeaderProps({
        projectId: monitor.projectId,
        title: liveName
          ? t("editAlertNamed", { monitorName: liveName })
          : t("editAlert"),
        alertsLabel: t("alerts"),
      })}
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
  const t = useTranslations("operationsUi.monitors.pages");

  if (error?.data?.code == "NOT_FOUND") {
    return (
      <ErrorPage title={t("notFoundTitle")} message={t("notFoundMessage")} />
    );
  }

  return <ErrorPage title={t("editErrorTitle")} message={error.message} />;
};

/** EditMonitorLoadingPage renders a loading page while the monitor is loading */
const EditMonitorLoadingPage = ({ projectId }: { projectId: string }) => {
  const t = useTranslations("operationsUi.monitors.pages");
  return (
    <Page
      withPadding
      headerProps={getHeaderProps({
        projectId,
        title: t("editAlert"),
        alertsLabel: t("alerts"),
      })}
    >
      <></>
    </Page>
  );
};

/** getHeaderProps returns the page header properties for the EditMonitors page */
const getHeaderProps = ({
  projectId,
  title,
  alertsLabel,
}: {
  projectId: string;
  title: string;
  alertsLabel: string;
}) => ({
  title,
  breadcrumb: [{ name: alertsLabel, href: `/project/${projectId}/alerts` }],
});
