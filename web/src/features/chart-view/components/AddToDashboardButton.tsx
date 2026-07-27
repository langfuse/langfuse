import React, { useCallback, useState } from "react";
import { useRouter } from "next/router";
import { LayoutDashboard } from "lucide-react";
import { type FilterState } from "@langfuse/shared";
import { Button } from "@/src/components/ui/button";
import { api } from "@/src/utils/api";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { SelectDashboardDialog } from "@/src/features/dashboard/components/SelectDashboardDialog";
import { type ChartViewConfig } from "../types";
import { chartConfigToWidgetInput } from "../lib/chartConfigToWidget";

/**
 * "Add to dashboard" — turns the in-view chart into a real dashboard widget by
 * REUSING the existing add-widget machinery, not duplicating it: map the chart
 * config to the `dashboardWidgets.create` input, pick a dashboard via the
 * existing `SelectDashboardDialog`, then hand off to the dashboard's own
 * `?addWidgetId=…` placement flow (same as the widget builder's save path).
 * Gated on `dashboards:CUD`, matching the server scope, so it never dead-ends.
 */
export const AddToDashboardButton = React.memo(function AddToDashboardButton({
  projectId,
  config,
  filters,
}: {
  projectId: string;
  config: ChartViewConfig;
  filters: FilterState;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const hasAccess = useHasProjectAccess({ projectId, scope: "dashboards:CUD" });
  const createWidget = api.dashboardWidgets.create.useMutation();

  const onSelectDashboard = useCallback(
    (dashboardId: string) => {
      createWidget.mutate(
        { projectId, ...chartConfigToWidgetInput({ config, filters }) },
        {
          onSuccess: async (data) => {
            setOpen(false);
            // Hand off to the dashboard's existing placement flow — it reads
            // addWidgetId, fetches the widget, and drops it on the grid.
            await router.push(
              `/project/${projectId}/dashboards/${dashboardId}?addWidgetId=${data.widget.id}`,
            );
          },
          // Surface failures instead of leaving the dialog open with no feedback;
          // keep it open so the user can retry or pick another dashboard.
          onError: (error) =>
            showErrorToast("Failed to add chart to dashboard", error.message),
        },
      );
    },
    [createWidget, projectId, config, filters, router],
  );

  if (!hasAccess) return null;

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="h-7 gap-1.5"
        onClick={() => setOpen(true)}
        disabled={createWidget.isPending}
      >
        <LayoutDashboard className="h-3.5 w-3.5" />
        Add to dashboard
      </Button>
      <SelectDashboardDialog
        open={open}
        onOpenChange={setOpen}
        projectId={projectId}
        onSelectDashboard={onSelectDashboard}
        onSkip={() => setOpen(false)}
      />
    </>
  );
});
