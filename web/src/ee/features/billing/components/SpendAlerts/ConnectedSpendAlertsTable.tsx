import { useMemo, type ComponentProps } from "react";
import { api } from "@/src/utils/api";
import { useHasOrganizationAccess } from "@/src/features/rbac";
import { SpendAlertsTable } from "./SpendAlertsTable";
import { ConnectedSpendAlertDialogController } from "./ConnectedSpendAlertDialogController";
import { ConnectedDeleteSpendAlertDialogController } from "./ConnectedDeleteSpendAlertDialogController";

export function ConnectedSpendAlertsTable({ orgId }: { orgId: string }) {
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

  return (
    <ConnectedDeleteSpendAlertDialogController
      orgId={orgId}
      onSuccess={() => {
        refetch();
      }}
    >
      {({ openDialog: openDeleteDialog }) => (
        <ConnectedSpendAlertDialogController
          orgId={orgId}
          onSuccess={() => {
            refetch();
          }}
        >
          {({ openDialog }) => (
            <SpendAlertsTable
              data={data}
              onEdit={(id) => {
                const alert = spendAlerts?.find((alert) => alert.id === id);
                if (!alert) return;
                openDialog({ mode: "edit", alert });
              }}
              onDelete={openDeleteDialog}
            />
          )}
        </ConnectedSpendAlertDialogController>
      )}
    </ConnectedDeleteSpendAlertDialogController>
  );
}
