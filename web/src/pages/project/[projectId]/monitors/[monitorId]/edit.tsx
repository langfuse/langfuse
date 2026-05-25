import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { Pause, Play } from "lucide-react";

import Page from "@/src/components/layouts/page";
import { Button } from "@/src/components/ui/button";
import { ErrorPage } from "@/src/components/error-page";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import useIsFeatureEnabled from "@/src/features/feature-flags/hooks/useIsFeatureEnabled";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { MonitorForm } from "@/src/features/monitors";
import { api } from "@/src/utils/api";

export default function EditMonitorPage() {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const monitorId = router.query.monitorId as string;
  const isEnabled = useIsFeatureEnabled("monitors");
  const hasAccess = useHasProjectAccess({ projectId, scope: "monitors:CUD" });
  const utils = api.useUtils();

  const { data, error, isPending } = api.monitors.get.useQuery(
    { projectId, id: monitorId },
    { enabled: isEnabled && Boolean(monitorId) },
  );

  // Live mirror of the form's name so the page title updates as the user
  // edits, without waiting for a save round-trip.
  const [liveName, setLiveName] = useState("");
  useEffect(() => {
    setLiveName(data?.name ?? "");
  }, [data?.name]);

  // Used to flip just the status from the toolbar pause / resume button —
  // sends the full update payload because that's what `monitors.update`
  // expects, but only the `status` field changes.
  const updateMutation = api.monitors.update.useMutation({
    onSuccess: async () => {
      await utils.monitors.invalidate();
    },
    onError: (e) =>
      showErrorToast("Failed to update monitor status", e.message),
  });

  if (!isEnabled) {
    return <ErrorPage title="Not found" message="This page does not exist." />;
  }

  if (error?.data?.code === "NOT_FOUND") {
    return (
      <ErrorPage
        title="Monitor not found"
        message="This monitor doesn't exist or has been deleted."
      />
    );
  }

  const isPaused = data?.status === "PAUSED";

  const togglePause = () => {
    if (!data) return;
    const nextStatus = isPaused ? "ACTIVE" : "PAUSED";
    updateMutation.mutate(
      {
        id: data.id,
        projectId: data.projectId,
        view: data.view,
        filters: data.filters,
        metric: data.metric,
        window: data.window,
        thresholdOperator: data.thresholdOperator,
        alertThreshold: data.alertThreshold,
        warningThreshold: data.warningThreshold,
        noData: data.noData,
        renotify: data.renotify,
        name: data.name,
        tags: data.tags,
        status: nextStatus,
      },
      {
        onSuccess: () =>
          showSuccessToast({
            title:
              nextStatus === "PAUSED" ? "Monitor paused" : "Monitor resumed",
            description:
              nextStatus === "PAUSED"
                ? "Evaluations are halted until you resume."
                : "Evaluations have resumed.",
          }),
      },
    );
  };

  return (
    <Page
      withPadding
      headerProps={{
        title: liveName ? `Edit Monitor - ${liveName}` : "Edit Monitor",
        breadcrumb: [{ name: "Monitors", href: `/project/${projectId}` }],
        actionButtonsRight: data ? (
          <Button
            variant="outline"
            disabled={!hasAccess || updateMutation.isPending}
            onClick={togglePause}
          >
            {isPaused ? (
              <Play className="mr-2 h-4 w-4" aria-hidden="true" />
            ) : (
              <Pause className="mr-2 h-4 w-4" aria-hidden="true" />
            )}
            {isPaused ? "Resume" : "Pause"}
          </Button>
        ) : null,
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
