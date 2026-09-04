import React, { useState } from "react";
import { api, type RouterOutputs } from "@/src/utils/api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogBody,
} from "@/src/components/ui/dialog";
import { Button } from "@/src/components/ui/button";
import { SimpleDataTable } from "@/src/components/table/simple-data-table";
import { createTextTableColumn } from "@/src/components/design-system/table/columns/createTextTableColumn";
import { type LangfuseColumnDef } from "@/src/components/table/types";

type Dashboard =
  RouterOutputs["dashboard"]["allDashboards"]["dashboards"][number];

const columns: LangfuseColumnDef<Dashboard>[] = [
  createTextTableColumn<Dashboard>({
    accessorKey: "name",
    header: "Name",
  }),
  createTextTableColumn<Dashboard>({
    accessorKey: "description",
    header: "Description",
  }),
  {
    accessorKey: "updatedAt",
    header: "Updated",
    cell: ({ getValue }) => getValue<Date>().toLocaleString(),
  },
];

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
          <DialogTitle>Select dashboard to add widget to</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="mt-4 max-h-[400px] overflow-y-auto">
            {dashboards.isLoading ? (
              <div className="py-8 text-center">Loading dashboards...</div>
            ) : dashboards.isError ? (
              <div className="text-destructive py-8 text-center">
                Error: {dashboards.error.message}
              </div>
            ) : dashboards.data?.dashboards.length === 0 ? (
              <div className="text-muted-foreground py-8 text-center">
                No dashboards found.
              </div>
            ) : (
              <SimpleDataTable
                columns={columns}
                data={
                  dashboards.data?.dashboards.filter(
                    (dashboard: Dashboard) => dashboard.owner === "PROJECT",
                  ) ?? []
                }
                isLoading={false}
                noResults={null}
                rowVariant="muted-hover"
                selectedRowId={selectedDashboardId}
                onRowClick={(dashboard) => setSelectedDashboardId(dashboard.id)}
              />
            )}
          </div>
        </DialogBody>
        <DialogFooter className="mt-4 flex justify-between">
          <Button variant="outline" onClick={handleSkip}>
            Skip
          </Button>
          <Button onClick={handleAdd} disabled={!selectedDashboardId}>
            Add to Dashboard
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
