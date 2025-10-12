import React, { useState } from "react";
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
import { PlusIcon } from "lucide-react";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/src/components/ui/table";
import { startCase } from "lodash";
import { getChartTypeDisplayName } from "@/src/features/widgets/chart-library/utils";
import { type DashboardWidgetChartType } from "@langfuse/shared/src/db";
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation();
  const router = useRouter();
  const [selectedWidgetId, setSelectedWidgetId] = useState<string | null>(null);

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

  const handleNavigateToNewWidget = () => {
    router.push(`/project/${projectId}/widgets/new?dashboardId=${dashboardId}`);
  };

  const handleAddWidget = () => {
    if (selectedWidgetId) {
      const selectedWidget = widgets.data?.widgets.find(
        (widget) => widget.id === selectedWidgetId,
      );
      if (selectedWidget) {
        onSelectWidget(selectedWidget as WidgetItem);
        onOpenChange(false);
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[800px]">
        <DialogHeader>
          <DialogTitle>{t("widget.dialog.selectWidgetToAdd")}</DialogTitle>
        </DialogHeader>

        <DialogBody>
          <div className="max-h-[400px] overflow-y-auto">
            {widgets.isPending ? (
              <div className="py-8 text-center">
                {t("widget.messages.loadingWidgets")}
              </div>
            ) : widgets.isError ? (
              <div className="py-8 text-center text-destructive">
                {t("common.errors.error")}: {widgets.error.message}
              </div>
            ) : widgets.data?.widgets.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">
                {t("widget.messages.noWidgetsFound")}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("widget.table.name")}</TableHead>
                    <TableHead>{t("widget.table.description")}</TableHead>
                    <TableHead>{t("widget.table.viewType")}</TableHead>
                    <TableHead>{t("widget.table.chartType")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {widgets.data?.widgets.map((widget) => (
                    <TableRow
                      key={widget.id}
                      onClick={() => setSelectedWidgetId(widget.id)}
                      className={`cursor-pointer hover:bg-muted ${
                        selectedWidgetId === widget.id ? "bg-muted" : ""
                      }`}
                    >
                      <TableCell className="font-medium">
                        {widget.name}
                      </TableCell>
                      <TableCell
                        className="truncate"
                        title={widget.description}
                      >
                        {widget.description}
                      </TableCell>
                      <TableCell>
                        {startCase(widget.view.toLowerCase())}
                      </TableCell>
                      <TableCell>
                        {getChartTypeDisplayName(
                          widget.chartType as DashboardWidgetChartType,
                          t,
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </DialogBody>

        <DialogFooter className="mt-4 flex justify-between">
          <Button onClick={handleNavigateToNewWidget} variant="outline">
            <PlusIcon className="mr-2 h-4 w-4" />
            {t("widget.dialog.createNewWidget")}
          </Button>
          <div className="flex gap-2">
            <Button onClick={() => onOpenChange(false)} variant="outline">
              {t("common.actions.cancel")}
            </Button>
            <Button onClick={handleAddWidget} disabled={!selectedWidgetId}>
              {t("widget.dialog.addSelectedWidget")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
