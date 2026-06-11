import { useRouter } from "next/router";
import { useEffect, useState } from "react";

import { ErrorPage } from "@/src/components/error-page";
import Page from "@/src/components/layouts/page";
import { MonitorForm } from "@/src/features/monitors/components/MonitorForm";
import { MonitorPagePermissions } from "@/src/features/monitors/components/MonitorPagePermissions";
import { api } from "@/src/utils/api";

/** EditMonitorPage gates the edit-monitor route and defers all data fetching to EditMonitorPageContent so blocked users never trigger the monitor query. */
export default function EditMonitorPage() {
  return (
    <MonitorPagePermissions scope="monitors:read">
      <EditMonitorPageContent />
    </MonitorPagePermissions>
  );
}

/** EditMonitorPageContent renders the edit form for a single monitor; runs only when the route gate has admitted the user. */
function EditMonitorPageContent() {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const monitorId = router.query.monitorId as string;

  const { data, error, isPending } = api.monitors.get.useQuery(
    { projectId, id: monitorId },
    { enabled: Boolean(monitorId) },
  );

  /** liveName mirrors the form's name so the page title updates as the user edits, without waiting for a save round-trip. */
  const [liveName, setLiveName] = useState("");
  useEffect(() => {
    setLiveName(data?.name ?? "");
  }, [data?.name]);

  if (error?.data?.code === "NOT_FOUND") {
    return (
      <ErrorPage
        title="Monitor not found"
        message="This monitor doesn't exist or has been deleted."
      />
    );
  }

  return (
    <Page
      withPadding
      headerProps={{
        title: liveName ? `Edit Monitor - ${liveName}` : "Edit Monitor",
        breadcrumb: [
          { name: "Monitors", href: `/project/${projectId}/monitors` },
        ],
      }}
    >
      {isPending ? null : data ? (
        <MonitorForm
          projectId={projectId}
          monitor={data}
          onNameChange={setLiveName}
        />
      ) : null}
    </Page>
  );
}
