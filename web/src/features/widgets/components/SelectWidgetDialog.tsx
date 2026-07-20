import React, { useEffect, useRef } from "react";
import { useRouter } from "next/router";
import { api } from "@/src/utils/api";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/src/components/ui/tabs";
import startCase from "lodash/startCase";
import { getChartTypeDisplayName } from "@/src/features/widgets/chart-library/utils";
import { ChartTypeIllustration } from "@/src/features/widgets/components/ChartTypeIllustration";
import {
  HOME_DASHBOARD_PRESET_IDS,
  type HomeDashboardPresetId,
} from "@langfuse/shared";
import { HOME_PRESET_METADATA } from "@/src/features/dashboard/components/home-preset-registry";
import { type DashboardWidgetChartType } from "@langfuse/shared/src/db";
import { InAppAgentWidgetComposer } from "@/src/ee/features/in-app-agent/components/InAppAgentWidgetComposer";

export type WidgetItem = {
  id: string;
  name: string;
  description: string;
  view: string;
  chartType: string;
  createdAt: Date;
  updatedAt: Date;
};

const rowClassName =
  "flex w-full items-center gap-4 rounded-lg border p-3 text-left hover:bg-accent/50 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring";

function RowIllustration({ type }: { type: string }) {
  return (
    <div className="bg-muted/40 flex h-14 w-[5.5rem] shrink-0 items-center justify-center rounded-md">
      <ChartTypeIllustration
        type={type as DashboardWidgetChartType | "CUSTOM"}
        className="h-11 w-16"
      />
    </div>
  );
}

function WidgetRow({
  widget,
  onClick,
}: {
  widget: WidgetItem;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className={rowClassName}>
      <RowIllustration type={widget.chartType} />
      <div className="min-w-0 flex-1">
        <div className="truncate font-bold" title={widget.name}>
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
  );
}

interface SelectWidgetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  onSelectWidget: (widget: WidgetItem) => void;
  /** Adds a Langfuse Home card as a preset placement. */
  onSelectPreset?: (presetId: HomeDashboardPresetId) => void;
  dashboardId: string;
}

export function SelectWidgetDialog({
  open,
  onOpenChange,
  projectId,
  onSelectWidget,
  onSelectPreset,
  dashboardId,
}: SelectWidgetDialogProps) {
  const router = useRouter();
  const capture = usePostHogClientCapture();

  const openCapturedRef = useRef(false);
  useEffect(() => {
    if (open && !openCapturedRef.current) {
      capture("dashboard:add_widget_dialog_open", {
        dashboard_id: dashboardId,
      });
    }
    openCapturedRef.current = open;
  }, [open, dashboardId, capture]);

  // Fetch widgets (project-owned and Langfuse-maintained)
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

  const projectWidgets = widgets.data?.widgets ?? [];

  const selectWidget = (widget: WidgetItem) => {
    capture("dashboard:widget_added", {
      kind: "project_widget",
      widget_id: widget.id,
      chart_type: widget.chartType,
      view: widget.view,
      dashboard_id: dashboardId,
    });
    onSelectWidget(widget);
    onOpenChange(false);
  };

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
            <div className="flex flex-col gap-3 p-1">
              <InAppAgentWidgetComposer
                onSubmitted={() => onOpenChange(false)}
              />
              <button
                type="button"
                onClick={() => {
                  capture("dashboard:new_widget_form_open", {
                    source: "add_widget_dialog",
                    dashboard_id: dashboardId,
                  });
                  router.push(
                    `/project/${projectId}/widgets/new?dashboardId=${dashboardId}`,
                  );
                }}
                className={`${rowClassName} border-dashed`}
              >
                <RowIllustration type="CUSTOM" />
                <div className="min-w-0 flex-1">
                  <div className="font-bold">Custom Chart</div>
                  <div className="text-muted-foreground text-xs">
                    Pick a data view, metrics, and chart type from scratch
                  </div>
                </div>
              </button>

              <Tabs
                defaultValue={
                  projectWidgets.length > 0 ? "project" : "home-cards"
                }
                onValueChange={(tab) =>
                  capture("dashboard:add_widget_tab_switch", { tab })
                }
              >
                <TabsList>
                  <TabsTrigger value="project">
                    Your widgets ({projectWidgets.length})
                  </TabsTrigger>
                  {onSelectPreset && (
                    <TabsTrigger value="home-cards">
                      Home cards ({HOME_DASHBOARD_PRESET_IDS.length})
                    </TabsTrigger>
                  )}
                </TabsList>
                <TabsContent value="project">
                  <div className="flex max-h-[360px] flex-col gap-2 overflow-y-auto p-1">
                    {projectWidgets.length === 0 ? (
                      <div className="text-muted-foreground py-8 text-center text-sm">
                        No saved widgets in this project yet — build one with
                        Custom Chart.
                      </div>
                    ) : (
                      projectWidgets.map((widget) => (
                        <WidgetRow
                          key={widget.id}
                          widget={widget as WidgetItem}
                          onClick={() => selectWidget(widget as WidgetItem)}
                        />
                      ))
                    )}
                  </div>
                </TabsContent>
                {onSelectPreset && (
                  <TabsContent value="home-cards">
                    <div className="flex max-h-[360px] flex-col gap-2 overflow-y-auto p-1">
                      {HOME_DASHBOARD_PRESET_IDS.map((presetId) => {
                        const meta = HOME_PRESET_METADATA[presetId];
                        return (
                          <button
                            key={presetId}
                            type="button"
                            onClick={() => {
                              onSelectPreset(presetId);
                              onOpenChange(false);
                            }}
                            className={rowClassName}
                          >
                            <RowIllustration type={meta.illustration} />
                            <div className="min-w-0 flex-1">
                              <div
                                className="truncate font-bold"
                                title={meta.name}
                              >
                                {meta.name}
                              </div>
                              <div
                                className="text-muted-foreground truncate text-xs"
                                title={meta.description}
                              >
                                {meta.description}
                              </div>
                              <div className="text-muted-foreground/80 mt-0.5 text-xs">
                                Home card · fixed configuration
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </TabsContent>
                )}
              </Tabs>
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
