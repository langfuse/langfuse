import { useRouter } from "next/router";
import Page from "@/src/components/layouts/page";
import { api } from "@/src/utils/api";
import { WidgetForm } from "@/src/features/widgets";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { type DashboardWidgetChartType } from "@langfuse/shared/src/db";
import {
  type views,
  type metricAggregations,
} from "@/src/features/query/types";
import { type z } from "zod";

export default function NewWidget() {
  const router = useRouter();
  const { projectId, dashboardId } = router.query as {
    projectId: string;
    dashboardId?: string;
  };

  // Save widget mutation
  const createWidgetMutation = api.dashboardWidgets.create.useMutation({
    onSuccess: (data) => {
      showSuccessToast({
        title: "Widget created successfully",
        description: "Your widget has been created.",
      });

      // If dashboardId is provided, redirect back to the dashboard with the new widget ID
      if (dashboardId) {
        void router.push(
          `/project/${projectId}/dashboards/${dashboardId}?addWidgetId=${data.widget.id}`,
        );
      } else {
        // Otherwise, navigate to widgets list
        void router.push(`/project/${projectId}/widgets`);
      }
    },
    onError: (error) => {
      showErrorToast("Failed to save widget", error.message);
    },
  });

  // Handle save widget
  const handleSaveWidget = (widgetData: {
    name: string;
    description: string;
    view: string;
    dimensions: { field: string }[];
    metrics: { measure: string; agg: string }[];
    filters: any[];
    chartType: DashboardWidgetChartType;
    chartConfig: { type: DashboardWidgetChartType; row_limit?: number };
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
    });
  };

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
          name: "Trace Chart",
          description: "This is a new widget",
          view: "traces",
          dimension: "none",
          measure: "count",
          aggregation: "count",
          filters: [],
          chartType: "LINE_TIME_SERIES",
        }}
      />
    </Page>
  );
}
