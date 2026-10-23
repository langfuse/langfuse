import { useMemo, useState, type ComponentProps } from "react";
import { api } from "@/src/utils/api";
import { useHasOrganizationAccess } from "@/src/features/rbac";
import { SpendAlertsTable } from "./SpendAlertsTable";
import { SpendAlertDialog } from "./SpendAlertDialog";
import { DeleteSpendAlertDialog } from "./DeleteSpendAlertDialog";

export function ConnectedSpendAlertsTable({ orgId }: { orgId: string }) {
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

  const data = useMemo<ComponentProps<typeof SpendAlertsTable>["data"]>(() => {
    if (isLoading) return { status: "loading" };
    if (isError) return { status: "error", error: error.message };
    return {
      status: "success",
      data: (spendAlerts ?? []).map((alert) => ({
        id: alert.id,
        title: alert.title,
        threshold: parseFloat(alert.threshold.toString()),
        triggeredAt: alert.triggeredAt,
      })),
    };
  }, [isLoading, isError, error, spendAlerts]);

  const editingAlertData = spendAlerts?.find(
    (alert) => alert.id === editingAlert,
  );

  return (
    <>
      <SpendAlertsTable
        data={data}
        onEdit={setEditingAlert}
        onDelete={setDeletingAlert}
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
