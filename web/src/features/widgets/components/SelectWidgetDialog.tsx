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
import startCase from "lodash/startCase";
import { getChartTypeDisplayName } from "@/src/features/widgets/chart-library/utils";
import { ChartTypeIllustration } from "@/src/features/widgets/components/ChartTypeIllustration";
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

  const rowClassName =
    "flex w-full items-center gap-4 rounded-lg border p-3 text-left hover:bg-accent/50 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px]">
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
            <div className="flex max-h-[440px] flex-col gap-2 overflow-y-auto p-1">
              <button
                type="button"
                onClick={() =>
                  router.push(
                    `/project/${projectId}/widgets/new?dashboardId=${dashboardId}`,
                  )
                }
                className={`${rowClassName} border-dashed`}
              >
                <div className="bg-muted/40 flex h-14 w-[5.5rem] shrink-0 items-center justify-center rounded-md">
                  <ChartTypeIllustration type="CUSTOM" className="h-11 w-16" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium">Custom Chart</div>
                  <div className="text-muted-foreground text-xs">
                    Pick a data view, metrics, and chart type from scratch
                  </div>
                </div>
              </button>
              {widgets.data.widgets.map((widget) => (
                <button
                  key={widget.id}
                  type="button"
                  onClick={() => {
                    onSelectWidget(widget as WidgetItem);
                    onOpenChange(false);
                  }}
                  className={rowClassName}
                >
                  <div className="bg-muted/40 flex h-14 w-[5.5rem] shrink-0 items-center justify-center rounded-md">
                    <ChartTypeIllustration
                      type={widget.chartType as DashboardWidgetChartType}
                      className="h-11 w-16"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium" title={widget.name}>
                      {widget.name}
                    </div>
                    {widget.description ? (
                      <div
                        className="text-muted-foreground truncate text-xs"
                        title={widget.description}
                      >
                        {widget.description}
                      </div>
                    ) : null}
                    <div className="text-muted-foreground/80 mt-0.5 text-xs">
                      {getChartTypeDisplayName(
                        widget.chartType as DashboardWidgetChartType,
                      )}{" "}
                      · {startCase(widget.view.toLowerCase())}
                    </div>
                  </div>
                </button>
              ))}
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
