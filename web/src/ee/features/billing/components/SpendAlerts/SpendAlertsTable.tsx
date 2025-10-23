import { useMemo, useState } from "react";
import { Button } from "@/src/components/ui/button";
import { Badge } from "@/src/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { MoreHorizontal, Edit, Trash2 } from "lucide-react";
import { api } from "@/src/utils/api";
import { useHasOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";
import { formatDistanceToNow } from "date-fns";
import { SpendAlertDialog } from "./SpendAlertDialog";
import { DeleteSpendAlertDialog } from "./DeleteSpendAlertDialog";
import { DataTable } from "@/src/components/table/data-table";
import { DataTableToolbar } from "@/src/components/table/data-table-toolbar";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { usdFormatter } from "@/src/utils/numbers";

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
    {
      accessorKey: "title",
      id: "title",
      header: "Title",
      cell: ({ row }) => row.original.title,
      size: 160,
    },
    {
      accessorKey: "Limit",
      id: "limit",
      header: "Limit (USD)",
      size: 140,
      cell: ({ row }) => usdFormatter(row.original.threshold, 2, 2),
    },
    {
      accessorKey: "status",
      id: "status",
      header: "Status",
      size: 110,
      cell: ({ row }) => (
        <Badge variant={row.original.triggeredAt ? "destructive" : "secondary"}>
          {row.original.triggeredAt ? "Triggered" : "Active"}
        </Badge>
      ),
    },
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
    {
      accessorKey: "actions",
      id: "actions",
      header: "Actions",
      size: 120,
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setEditingAlert(row.original.id)}>
              <Edit className="mr-2 h-4 w-4" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setDeletingAlert(row.original.id)}
              className="text-destructive"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  const editingAlertData = spendAlerts?.find((a) => a.id === editingAlert);

  return (
    <>
      <DataTableToolbar columns={columns} />
      <DataTable tableName={"spend-alerts"} columns={columns} data={data} />

      {editingAlert && editingAlertData && (
        <SpendAlertDialog
          orgId={orgId}
          alert={editingAlertData}
          open={!!editingAlert}
          onOpenChange={(open) => !open && setEditingAlert(null)}
          onSuccess={() => {
            setEditingAlert(null);
            void refetch();
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
            void refetch();
          }}
        />
      )}
    </>
  );
}
