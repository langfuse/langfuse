import { useMemo, useState } from "react";
import { Edit, Trash2 } from "@langfuse/icons";
import { api } from "@/src/utils/api";
import { useHasOrganizationAccess } from "@/src/features/rbac";
import { formatDistanceToNow } from "date-fns";
import { SpendAlertDialog } from "./SpendAlertDialog";
import { DeleteSpendAlertDialog } from "./DeleteSpendAlertDialog";
import { SettingsTable } from "@/src/components/SettingsTable/SettingsTable";
import { type AsyncTableData } from "@/src/components/design-system/table/Table";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { createNumberTableColumn } from "@/src/components/design-system/table/columns/createNumberTableColumn";
import { createStatusTableColumn } from "@/src/components/design-system/table/columns/createStatusTableColumn";
import { createTextTableColumn } from "@/src/components/design-system/table/columns/createTextTableColumn";
import { costFormatter } from "@/src/utils/numbers";

interface SpendAlertsTableProps {
  orgId: string;
}

type AlertRow = {
  id: string;
  title: string;
  threshold: number; // USD
  triggeredAt: Date | null;
  createdAt: Date;
};

export function SpendAlertsTable({ orgId }: SpendAlertsTableProps) {
  const [editingAlert, setEditingAlert] = useState<string | null>(null);
  const [deletingAlert, setDeletingAlert] = useState<string | null>(null);

  const hasAccess = useHasOrganizationAccess({
    organizationId: orgId,
    scope: "langfuseCloudBilling:CRUD",
  });

  const {
    data: spendAlerts,
    isLoading,
    isError,
    error,
    refetch,
  } = api.spendAlerts.getSpendAlerts.useQuery(
    { orgId },
    { enabled: hasAccess },
  );

  const rows = useMemo<AlertRow[]>(() => {
    return (spendAlerts ?? []).map((a) => ({
      id: a.id,
      title: a.title,
      threshold: parseFloat(a.threshold?.toString?.() ?? "0"),
      triggeredAt: a.triggeredAt ? new Date(a.triggeredAt) : null,
      createdAt: new Date(a.createdAt),
    }));
  }, [spendAlerts]);

  const data = useMemo<AsyncTableData<AlertRow[]>>(() => {
    if (isLoading) return { status: "loading" };
    if (isError)
      return {
        status: "error",
        error: error.message,
      };
    return { status: "success", data: rows };
  }, [isLoading, isError, error, rows]);

  const columns: LangfuseColumnDef<AlertRow>[] = [
    createTextTableColumn<AlertRow>({
      accessorKey: "title",
      header: "Title",
      size: 160,
    }),
    createNumberTableColumn<AlertRow>({
      accessorFn: (row) => row.threshold,
      id: "limit",
      header: "Limit (USD)",
      size: 140,
      formatter: costFormatter,
    }),
    createStatusTableColumn<AlertRow, Date>({
      id: "status",
      accessorFn: (row) => row.triggeredAt,
      header: "Status",
      size: 110,
      isLive: false,
      getStatus: (triggeredAt) => (triggeredAt ? "triggered" : "active"),
    }),
    {
      accessorKey: "lastTriggered",
      id: "lastTriggered",
      header: "Last Triggered",
      size: 160,
      cell: ({ row }) =>
        row.original.triggeredAt
          ? formatDistanceToNow(new Date(row.original.triggeredAt), {
              addSuffix: true,
            })
          : "Never",
    },
  ];

  const editingAlertData = spendAlerts?.find((a) => a.id === editingAlert);

  return (
    <>
      <SettingsTable
        tableName="spend-alerts"
        columnVisibilityKey="spend-alertsColumnVisibility"
        columns={columns}
        data={data}
        actions={(row) => [
          {
            id: "edit",
            type: "item",
            title: "Edit",
            icon: Edit,
            onClick: () => setEditingAlert(row.id),
          },
          {
            id: "delete",
            type: "item",
            title: "Delete",
            icon: Trash2,
            variant: "destructive",
            onClick: () => setDeletingAlert(row.id),
          },
        ]}
      />

      {editingAlert && editingAlertData && (
        <SpendAlertDialog
          orgId={orgId}
          alert={editingAlertData}
          open={!!editingAlert}
          onOpenChange={(open) => !open && setEditingAlert(null)}
          onSuccess={() => {
            setEditingAlert(null);
            refetch();
          }}
        />
      )}

      {deletingAlert && (
        <DeleteSpendAlertDialog
          orgId={orgId}
          alertId={deletingAlert}
          open={!!deletingAlert}
          onOpenChange={(open) => !open && setDeletingAlert(null)}
          onSuccess={() => {
            setDeletingAlert(null);
            refetch();
          }}
        />
      )}
    </>
  );
}
