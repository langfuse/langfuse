import { useState } from "react";
import { Button } from "@/src/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/src/components/ui/table";
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

interface SpendAlertsTableProps {
  orgId: string;
}

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
    refetch,
  } = api.spendAlerts.getSpendAlerts.useQuery(
    { orgId },
    { enabled: hasAccess },
  );

  if (!hasAccess) {
    return (
      <div className="py-8 text-center">
        <p className="text-muted-foreground">
          You don&apos;t have permission to view spend alerts.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="py-8 text-center">
        <p className="text-muted-foreground">Loading spend alerts...</p>
      </div>
    );
  }

  if (!spendAlerts?.length) {
    return (
      <div className="py-8 text-center">
        <p className="text-muted-foreground">
          No spend alerts configured. Create your first alert to get notified
          when your spending exceeds a threshold.
        </p>
      </div>
    );
  }

  const editingAlertData = spendAlerts.find(
    (alert) => alert.id === editingAlert,
  );

  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Threshold (USD)</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last Triggered</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {spendAlerts.map((alert) => (
              <TableRow key={alert.id}>
                <TableCell className="font-medium">{alert.title}</TableCell>
                <TableCell>
                  ${parseFloat(alert.threshold.toString()).toFixed(2)}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={alert.triggeredAt ? "destructive" : "secondary"}
                  >
                    {alert.triggeredAt ? "Triggered" : "Active"}
                  </Badge>
                </TableCell>
                <TableCell>
                  {alert.triggeredAt
                    ? formatDistanceToNow(new Date(alert.triggeredAt), {
                        addSuffix: true,
                      })
                    : "Never"}
                </TableCell>
                <TableCell>
                  {formatDistanceToNow(new Date(alert.createdAt), {
                    addSuffix: true,
                  })}
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" className="h-8 w-8 p-0">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => setEditingAlert(alert.id)}
                      >
                        <Edit className="mr-2 h-4 w-4" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => setDeletingAlert(alert.id)}
                        className="text-destructive"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

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
