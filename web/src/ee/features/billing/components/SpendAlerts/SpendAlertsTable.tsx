import { useMemo, useState } from "react";
import { DropdownMenuItem } from "@/src/components/ui/dropdown-menu";
import { Edit, Trash2 } from "lucide-react";
import { api } from "@/src/utils/api";
import { useHasOrganizationAccess } from "@/src/features/rbac";
import { formatDistanceToNow } from "date-fns";
import { SpendAlertDialog } from "./SpendAlertDialog";
import { DeleteSpendAlertDialog } from "./DeleteSpendAlertDialog";
import { DataTable } from "@/src/components/table/data-table";
import { DataTableToolbar } from "@/src/components/table/data-table-toolbar";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { createDropdownTableColumn } from "@/src/components/design-system/table/columns/createDropdownTableColumn";
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
    refetch,
  } = api.spendAlerts.getSpendAlerts.useQuery(
    { orgId },
    { enabled: hasAccess },
  );

  const rows = useMemo<AlertRow[]>(() => {
    return (spendAlerts ?? []).map((a: any) => ({
      id: a.id,
      title: a.title,
      threshold: parseFloat(a.threshold?.toString?.() ?? "0"),
      triggeredAt: a.triggeredAt ? new Date(a.triggeredAt) : null,
      createdAt: new Date(a.createdAt),
    }));
  }, [spendAlerts]);

  const data = useMemo(() => {
    if (isLoading) return { isLoading: true, isError: false } as const;
    if (isError)
      return {
        isLoading: false,
        isError: false,
        data: [] as AlertRow[],
      } as const;
    return { isLoading: false, isError: false, data: rows } as const;
  }, [isLoading, isError, rows]);

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
    createDropdownTableColumn<AlertRow, string>({
      id: "actions",
      accessorFn: (row) => row.id,
      header: "Actions",
      size: 120,
      renderMenu: (id) =>
        id ? (
          <>
            <DropdownMenuItem onClick={() => setEditingAlert(id)}>
              <Edit className="mr-2 h-4 w-4" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setDeletingAlert(id)}
              className="text-destructive"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </>
        ) : null,
    }),
  ];

  const editingAlertData = spendAlerts?.find((a) => a.id === editingAlert);

  return (
    <>
      <DataTableToolbar columns={columns} />
      <DataTable tableName="spend-alerts" columns={columns} data={data} />

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
