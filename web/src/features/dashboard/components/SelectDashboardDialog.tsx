import React, { useState } from "react";
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
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/src/components/ui/table";
import { useLocale, useTranslations } from "next-intl";

export interface SelectDashboardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  onSelectDashboard: (dashboardId: string) => void;
  onSkip: () => void;
}

export function SelectDashboardDialog({
  open,
  onOpenChange,
  projectId,
  onSelectDashboard,
  onSkip,
}: SelectDashboardDialogProps) {
  const t = useTranslations("evaluationAnalytics.dashboard");
  const extrasT = useTranslations("systemUi.dashboardExtras");
  const locale = useLocale();
  const [selectedDashboardId, setSelectedDashboardId] = useState<string | null>(
    null,
  );

  const dashboards = api.dashboard.allDashboards.useQuery(
    {
      projectId,
      orderBy: {
        column: "updatedAt",
        order: "DESC",
      },
      page: 0,
      limit: 100,
    },
    {
      enabled: Boolean(projectId) && open,
    },
  );

  const handleAdd = () => {
    if (selectedDashboardId) {
      onSelectDashboard(selectedDashboardId);
      onOpenChange(false);
    }
  };

  const handleSkip = () => {
    onSkip();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[800px]">
        <DialogHeader>
          <DialogTitle>{t("selectTitle")}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="mt-4 max-h-[400px] overflow-y-auto">
            {dashboards.isLoading ? (
              <div className="py-8 text-center">{t("loading")}</div>
            ) : dashboards.isError ? (
              <div className="text-destructive py-8 text-center">
                {extrasT("error", { message: dashboards.error.message })}
              </div>
            ) : dashboards.data?.dashboards.length === 0 ? (
              <div className="text-muted-foreground py-8 text-center">
                {extrasT("noneFound")}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("name")}</TableHead>
                    <TableHead>{extrasT("description")}</TableHead>
                    <TableHead>{t("updated")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dashboards.data?.dashboards
                    .filter((d) => d.owner === "PROJECT")
                    .map((d) => (
                      <TableRow
                        key={d.id}
                        onClick={() => setSelectedDashboardId(d.id)}
                        className={`hover:bg-muted cursor-pointer ${
                          selectedDashboardId === d.id ? "bg-muted" : ""
                        }`}
                      >
                        <TableCell density="comfortable" className="font-bold">
                          {d.name}
                        </TableCell>
                        <TableCell
                          density="comfortable"
                          className="truncate"
                          title={d.description}
                        >
                          {d.description}
                        </TableCell>
                        <TableCell density="comfortable">
                          {new Date(d.updatedAt).toLocaleString(locale)}
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            )}
          </div>
        </DialogBody>
        <DialogFooter className="mt-4 flex justify-between">
          <Button variant="outline" onClick={handleSkip}>
            {extrasT("skip")}
          </Button>
          <Button onClick={handleAdd} disabled={!selectedDashboardId}>
            {extrasT("add")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
