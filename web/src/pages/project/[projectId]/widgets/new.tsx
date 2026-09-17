import { useRouter } from "next/router";
import Page from "@/src/components/layouts/page";
import { api } from "@/src/utils/api";
import { WidgetForm } from "@/src/features/widgets";
import { type WidgetSavePayload } from "@/src/features/widgets/components/widgetFormSchema";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { type metricAggregations, type views } from "@langfuse/shared/query";
import { type z } from "zod";
import { SelectDashboardDialog } from "@/src/features/dashboard/components/SelectDashboardDialog";
import { useState } from "react";
import { useReadPath } from "@/src/features/events/hooks/useReadPath";
import { getDefaultView } from "@/src/features/widgets/utils";
import { NoDataOrLoading } from "@/src/components/NoDataOrLoading";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";

export default function NewWidget() {
  const router = useRouter();
  const { projectId, dashboardId } = router.query as {
    projectId: string;
    dashboardId?: string;
  };
  const { isV4, isResolved } = useReadPath();
  const capture = usePostHogClientCapture();

  const createWidgetMutation = api.dashboardWidgets.create.useMutation({
    onSuccess: (data, variables) => {
      // Which measure/aggregation/chart shapes do users actually save?
      capture("dashboard:widget_saved", {
        isNew: true,
        view: variables.view,
        chartType: variables.chartType,
        measures: variables.metrics.map((m) => `${m.agg}:${m.measure}`),
        dimensionCount: variables.dimensions.length,
        filterCount: variables.filters.length,
      });
      showSuccessToast({
        title: "Widget created successfully",
        description: "Your widget has been created.",
      });

      if (dashboardId) {
        router.push(
          `/project/${projectId}/dashboards/${dashboardId}?addWidgetId=${data.widget.id}`,
        );
      } else {
        setPendingWidgetId(data.widget.id); // store for dialog
        setDashboardDialogOpen(true);
      }
    },
    onError: (error) => {
      showErrorToast("Failed to save widget", error.message);
    },
  });

  const handleSaveWidget = (widgetData: WidgetSavePayload) => {
    if (!widgetData.name.trim()) {
      showErrorToast("Error", "Widget name is required");
      return;
    }

    // Prepare the widget data
    createWidgetMutation.mutate({
      projectId,
      name: widgetData.name,
      description: widgetData.description,
      view: widgetData.view as z.infer<typeof views>,
      dimensions: widgetData.dimensions,
      metrics: widgetData.metrics.map((metric) => ({
        measure: metric.measure,
        agg: metric.agg as z.infer<typeof metricAggregations>,
      })),
      filters: widgetData.filters,
      chartType: widgetData.chartType,
      chartConfig: widgetData.chartConfig,
    });
  };

  const [dashboardDialogOpen, setDashboardDialogOpen] = useState(false);
  const [pendingWidgetId, setPendingWidgetId] = useState<string | null>(null);

  // The form seeds its default view from the read path once, at mount — an
  // unresolved session would permanently seed the v3 default for a v4 user.
  if (!isResolved) {
    return (
      <Page
        withPadding
        headerProps={{
          title: "New Widget",
          help: {
            description: "Create a new widget",
          },
        }}
      >
        <NoDataOrLoading isLoading />
      </Page>
    );
  }

  return (
    <Page
      withPadding
      headerProps={{
        title: "New Widget",
        help: {
          description: "Create a new widget",
        },
      }}
    >
      <WidgetForm
        // No `key` on the beta flag: WidgetForm derives viewVersion (and its
        // available views/measures/filter columns) reactively from isV4
        // + the selected view, so a live beta toggle re-derives them without a
        // remount — preserving the in-progress form. The only tradeoff is that
        // an untouched form's default view no longer auto-switches on toggle;
        // the initial mount still seeds the beta-aware default view below.
        projectId={projectId}
        onSave={handleSaveWidget}
        initialValues={{
          name: "",
          description: "",
          view: getDefaultView(isV4),
          dimension: "none",
          measure: "count",
          aggregation: "count",
          filters: [],
          chartType: "LINE_TIME_SERIES",
          chartConfig: { type: "LINE_TIME_SERIES" },
        }}
        widgetId={undefined}
      />
      {pendingWidgetId && (
        <SelectDashboardDialog
          open={dashboardDialogOpen}
          onOpenChange={setDashboardDialogOpen}
          projectId={projectId}
          onSelectDashboard={(dashboardId) => {
            router.push(
              `/project/${projectId}/dashboards/${dashboardId}?addWidgetId=${pendingWidgetId}`,
            );
          }}
          onSkip={() => {
            router.push(`/project/${projectId}/widgets`);
          }}
        />
      )}
    </Page>
  );
}
