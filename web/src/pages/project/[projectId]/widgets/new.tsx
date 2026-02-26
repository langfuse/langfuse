import { useRouter } from "next/router";
import Page from "@/src/components/layouts/page";
import { api } from "@/src/utils/api";
import { type WidgetChartConfig, WidgetForm } from "@/src/features/widgets";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { type DashboardWidgetChartType } from "@langfuse/shared/src/db";
import {
  type views,
  type metricAggregations,
} from "@/src/features/query/types";
import { type z } from "zod/v4";
import { SelectDashboardDialog } from "@/src/features/dashboard/components/SelectDashboardDialog";
import { useState } from "react";

export default function NewWidget() {
  const router = useRouter();
  const { projectId, dashboardId } = router.query as {
    projectId: string;
    dashboardId?: string;
  };

  const createWidgetMutation = api.dashboardWidgets.create.useMutation({
    onSuccess: (data) => {
      showSuccessToast({
        title: "Widget created successfully",
        description: "Your widget has been created.",
      });

      if (dashboardId) {
        void router.push(
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

  const handleSaveWidget = (widgetData: {
    name: string;
    description: string;
    view: string;
    dimensions: { field: string }[];
    metrics: { measure: string; agg: string }[];
    filters: any[];
    chartType: DashboardWidgetChartType;
    chartConfig: WidgetChartConfig;
    minVersion: number;
  }) => {
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
      minVersion: widgetData.minVersion,
    });
  };

  const [dashboardDialogOpen, setDashboardDialogOpen] = useState(false);
  const [pendingWidgetId, setPendingWidgetId] = useState<string | null>(null);

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
        projectId={projectId}
        onSave={handleSaveWidget}
        initialValues={{
          name: "",
          description: "",
          view: "traces",
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
