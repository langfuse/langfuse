import { useRouter } from "next/router";
import Page from "@/src/components/layouts/page";
import { api } from "@/src/utils/api";
import { WidgetForm } from "@/src/features/widgets/components/WidgetForm";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { type DashboardWidgetChartType } from "@langfuse/shared/src/db";
import { type views, type metricAggregations } from "@/src/features/query";
import { type z } from "zod/v4";
import { type WidgetChartConfig } from "@/src/features/widgets/utils";

export default function EditWidget() {
  const router = useRouter();
  const { projectId, widgetId, dashboardId } = router.query as {
    projectId: string;
    widgetId: string;
    dashboardId?: string;
  };

  // Fetch the widget details
  const { data: widgetData, isLoading: isWidgetLoading } =
    api.dashboardWidgets.get.useQuery(
      {
        projectId,
        widgetId,
      },
      {
        enabled: Boolean(projectId) && Boolean(widgetId),
      },
    );

  // Update widget mutation
  const updateWidgetMutation = api.dashboardWidgets.update.useMutation({
    onSuccess: () => {
      showSuccessToast({
        title: "Widget updated successfully",
        description: "Your widget has been updated.",
      });
      // Navigate back to dashboard if provided else widgets list
      if (dashboardId) {
        void router.push(
          `/project/${projectId}/dashboards/${dashboardId}?addWidgetId=${widgetId}`,
        );
      } else {
        void router.push(`/project/${projectId}/widgets`);
      }
    },
    onError: (error) => {
      showErrorToast("Failed to update widget", error.message);
    },
  });

  // Handle update widget
  const handleUpdateWidget = (widgetFormData: {
    name: string;
    description: string;
    view: string;
    dimensions: { field: string }[];
    metrics: { measure: string; agg: string }[];
    filters: any[];
    chartType: DashboardWidgetChartType;
    chartConfig: WidgetChartConfig;
  }) => {
    if (!widgetId) return;

    updateWidgetMutation.mutate({
      projectId,
      widgetId,
      name: widgetFormData.name,
      description: widgetFormData.description,
      view: widgetFormData.view as z.infer<typeof views>,
      dimensions: widgetFormData.dimensions,
      metrics: widgetFormData.metrics.map((metric) => ({
        measure: metric.measure,
        agg: metric.agg as z.infer<typeof metricAggregations>,
      })),
      filters: widgetFormData.filters,
      chartType: widgetFormData.chartType,
      chartConfig: widgetFormData.chartConfig,
    });
  };

  return (
    <Page
      withPadding
      headerProps={{
        title: "Edit Widget",
        help: {
          description: "Edit an existing widget",
        },
      }}
    >
      {!isWidgetLoading && widgetData ? (
        <WidgetForm
          projectId={projectId}
          widgetId={widgetId}
          onSave={handleUpdateWidget}
          initialValues={{
            name: widgetData.name,
            description: widgetData.description,
            view: widgetData.view as z.infer<typeof views>,
            // Pass complete arrays for editing mode
            metrics: widgetData.metrics,
            dimensions: widgetData.dimensions,
            // Keep single values for backward compatibility and fallbacks
            dimension: widgetData.dimensions.slice().shift()?.field ?? "none",
            measure: widgetData.metrics.slice().shift()?.measure ?? "count",
            aggregation:
              (widgetData.metrics.slice().shift()?.agg as z.infer<
                typeof metricAggregations
              >) ?? "count",
            filters: widgetData.filters,
            chartType: widgetData.chartType,
            chartConfig: widgetData.chartConfig,
          }}
        />
      ) : (
        <div className="flex h-[300px] items-center justify-center">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      )}
    </Page>
  );
}
