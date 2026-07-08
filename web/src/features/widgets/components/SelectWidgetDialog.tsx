import React from "react";
import { useRouter } from "next/router";
import { api } from "@/src/utils/api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogBody,
} from "@/src/components/ui/dialog";
import { Button } from "@/src/components/ui/button";
import {
  BarChart,
  BarChart3,
  BarChartHorizontal,
  Hash,
  LineChart,
  PieChart,
  PlusIcon,
  Table as TableIcon,
  AreaChart,
} from "lucide-react";
import startCase from "lodash/startCase";
import { getChartTypeDisplayName } from "@/src/features/widgets/chart-library/utils";
import { type DashboardWidgetChartType } from "@langfuse/shared/src/db";

export type WidgetItem = {
  id: string;
  name: string;
  description: string;
  view: string;
  chartType: string;
  createdAt: Date;
  updatedAt: Date;
};

const chartTypeIcons: Partial<
  Record<DashboardWidgetChartType, React.ElementType>
> = {
  NUMBER: Hash,
  LINE_TIME_SERIES: LineChart,
  BAR_TIME_SERIES: BarChart,
  AREA_TIME_SERIES: AreaChart,
  HORIZONTAL_BAR: BarChartHorizontal,
  VERTICAL_BAR: BarChart,
  HISTOGRAM: BarChart3,
  PIE: PieChart,
  PIVOT_TABLE: TableIcon,
};

interface SelectWidgetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  onSelectWidget: (widget: WidgetItem) => void;
  dashboardId: string;
}

export function SelectWidgetDialog({
  open,
  onOpenChange,
  projectId,
  onSelectWidget,
  dashboardId,
}: SelectWidgetDialogProps) {
  const router = useRouter();

  // Fetch widgets
  const widgets = api.dashboardWidgets.all.useQuery(
    {
      projectId,
      orderBy: {
        column: "updatedAt",
        order: "DESC",
      },
    },
    {
      enabled: Boolean(projectId) && open,
    },
  );

  const tileClassName =
    "flex h-32 flex-col items-center justify-center gap-1.5 rounded-lg border p-3 text-center hover:bg-accent/50 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[800px]">
        <DialogHeader>
          <DialogTitle>Add widget</DialogTitle>
        </DialogHeader>

        <DialogBody>
          {widgets.isPending ? (
            <div className="py-8 text-center">Loading widgets...</div>
          ) : widgets.isError ? (
            <div className="text-destructive py-8 text-center">
              Error: {widgets.error.message}
            </div>
          ) : (
            <div className="grid max-h-[420px] grid-cols-2 gap-3 overflow-y-auto p-1 md:grid-cols-3">
              <button
                type="button"
                onClick={() =>
                  router.push(
                    `/project/${projectId}/widgets/new?dashboardId=${dashboardId}`,
                  )
                }
                className={`${tileClassName} border-dashed`}
              >
                <PlusIcon className="text-muted-foreground h-8 w-8" />
                <span className="font-medium">Custom Chart</span>
                <span className="text-muted-foreground text-xs">
                  Build a new widget from scratch
                </span>
              </button>
              {widgets.data.widgets.map((widget) => {
                const Icon =
                  chartTypeIcons[
                    widget.chartType as DashboardWidgetChartType
                  ] ?? LineChart;
                return (
                  <button
                    key={widget.id}
                    type="button"
                    onClick={() => {
                      onSelectWidget(widget as WidgetItem);
                      onOpenChange(false);
                    }}
                    className={tileClassName}
                    title={widget.description || widget.name}
                  >
                    <Icon className="text-muted-foreground h-8 w-8" />
                    <span
                      className="w-full truncate font-medium"
                      title={widget.name}
                    >
                      {widget.name}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {getChartTypeDisplayName(
                        widget.chartType as DashboardWidgetChartType,
                      )}{" "}
                      · {startCase(widget.view.toLowerCase())}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </DialogBody>

        <DialogFooter className="mt-4">
          <Button onClick={() => onOpenChange(false)} variant="outline">
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
