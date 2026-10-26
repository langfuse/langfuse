import { useMemo } from "react";
import { Pencil, PlusIcon, Send, Trash } from "@langfuse/icons";

import { type PagerDutyIntegrationListItem } from "@langfuse/shared/pagerduty";
import { ConfirmationDialogController } from "@/src/components/design-system/ConfirmationDialogController/ConfirmationDialogController";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import {
  type AsyncTableData,
  type TableProps,
} from "@/src/components/design-system/table/Table";
import { createTextTableColumn } from "@/src/components/design-system/table/columns/createTextTableColumn";
import { SettingsTable } from "@/src/components/SettingsTable/SettingsTable";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { PagerDutyIntegrationDialog } from "@/src/features/pagerduty/components/PagerDutyIntegrationDialog";
import { PagerDutyTestEventDialogController } from "@/src/features/pagerduty/components/PagerDutyTestEventDialogController";
import { usePagerDutyIntegrations } from "@/src/features/pagerduty/usePagerDutyIntegrations";
import { useHasProjectAccess } from "@/src/features/rbac";
import { api } from "@/src/utils/api";

const columns: LangfuseColumnDef<PagerDutyIntegrationListItem>[] = [
  createTextTableColumn<PagerDutyIntegrationListItem>({
    accessorKey: "name",
    header: "Name",
    enableResizing: false,
  }),
  createTextTableColumn<PagerDutyIntegrationListItem>({
    accessorKey: "displayRoutingKey",
    header: "Routing key",
    enableResizing: false,
  }),
  createTextTableColumn<PagerDutyIntegrationListItem>({
    accessorKey: "region",
    header: "Region",
    enableResizing: false,
  }),
];

/** EmptyState tells the user how to connect the first service. */
function EmptyState() {
  return (
    <p className="text-muted-foreground p-4 text-sm">
      No PagerDuty services connected. Add the routing key of a PagerDuty
      service or Event Orchestration to send alerts there.
    </p>
  );
}

/** useTableData maps the list query to the table's async data. */
function useTableData(
  projectId: string,
): AsyncTableData<PagerDutyIntegrationListItem[]> {
  const { query } = usePagerDutyIntegrations(projectId);
  return useMemo(() => {
    if (query.isLoading) return { status: "loading" };
    if (query.isError) {
      return { status: "error", error: "Failed to load PagerDuty services" };
    }
    return { status: "success", data: query.data ?? [] };
  }, [query.data, query.isError, query.isLoading]);
}

/** useDeleteIntegration deletes a routing key and refreshes the list. */
function useDeleteIntegration(projectId: string) {
  const utils = api.useUtils();
  return api.pagerDuty.delete.useMutation({
    meta: { silentAllErrors: true },
    onSuccess: () => utils.pagerDuty.list.invalidate({ projectId }),
  });
}

/** toolbarActions offers adding a routing key to users who may manage integrations. */
function toolbarActions(canManage: boolean, onAdd: () => void) {
  if (!canManage) return undefined;
  return [
    {
      id: "add-pagerduty-service",
      label: "Add service",
      variant: "secondary" as const,
      icon: <PlusIcon size="base" aria-hidden="true" />,
      onClick: onAdd,
    },
  ];
}

/** disabledUnless returns the menu-item disabled reason when access is missing. */
function disabledUnless(
  hasAccess: boolean,
  reason: string,
): { reason: string } | undefined {
  if (hasAccess) return undefined;
  return { reason };
}

/** rowActions builds the per-key menu, disabling what the user may not do. */
function rowActions(args: {
  canManage: boolean;
  canTest: boolean;
  onEdit: (integration: PagerDutyIntegrationListItem) => void;
  onTest: (integration: PagerDutyIntegrationListItem) => void;
  onDelete: (integration: PagerDutyIntegrationListItem) => void;
}): NonNullable<TableProps<PagerDutyIntegrationListItem>["actions"]> {
  const manageDisabled = disabledUnless(
    args.canManage,
    "Only project admins can manage PagerDuty services",
  );
  return (integration) => [
    {
      id: "edit",
      type: "item",
      title: "Edit",
      icon: Pencil,
      disabled: manageDisabled,
      onClick: () => args.onEdit(integration),
    },
    {
      id: "test",
      type: "item",
      title: "Send test event",
      icon: Send,
      disabled: disabledUnless(
        args.canTest,
        "You do not have permission to manage automations",
      ),
      onClick: () => args.onTest(integration),
    },
    {
      id: "delete",
      type: "item",
      title: "Delete",
      icon: Trash,
      variant: "destructive",
      disabled: manageDisabled,
      onClick: () => args.onDelete(integration),
    },
  ];
}

/** PagerDutyIntegrationsTable lists, adds, edits, tests and deletes a project's PagerDuty routing keys; it is read-only without integrations:CRUD. */
export function PagerDutyIntegrationsTable({
  projectId,
}: {
  projectId: string;
}) {
  const canManage = useHasProjectAccess({
    projectId,
    scope: "integrations:CRUD",
  });
  const canTest = useHasProjectAccess({
    projectId,
    scope: "automations:CUD",
  });
  const data = useTableData(projectId);
  const deleteIntegration = useDeleteIntegration(projectId);

  return (
    <DialogController<{ integration: PagerDutyIntegrationListItem | null }>
      renderDialog={({ state, closeDialog }) => (
        <PagerDutyIntegrationDialog
          projectId={projectId}
          integration={state.integration}
          closeDialog={closeDialog}
        />
      )}
    >
      {({ openDialog: openEditDialog }) => (
        <PagerDutyTestEventDialogController projectId={projectId}>
          {({ openDialog: openTestDialog }) => (
            <ConfirmationDialogController<PagerDutyIntegrationListItem>
              title="Delete PagerDuty service"
              text={(integration) =>
                `Delete "${integration.name}"? Automations can no longer send to this routing key.`
              }
              confirmLabel="Delete"
              variant="destructive"
              loading={deleteIntegration.isPending}
              error={deleteIntegration.error?.message}
              onAfterDismiss={() => deleteIntegration.reset()}
              onConfirm={async (integration) => {
                await deleteIntegration.mutateAsync({
                  projectId,
                  id: integration.id,
                });
              }}
            >
              {({ openDialog: openDeleteDialog }) => (
                <SettingsTable
                  tableName="PagerDuty services"
                  columns={columns}
                  data={data}
                  emptyState={<EmptyState />}
                  toolbarActions={toolbarActions(canManage, () =>
                    openEditDialog({ integration: null }),
                  )}
                  actions={rowActions({
                    canManage,
                    canTest,
                    onEdit: (integration) => openEditDialog({ integration }),
                    onTest: (integration) => openTestDialog(integration.id),
                    onDelete: openDeleteDialog,
                  })}
                />
              )}
            </ConfirmationDialogController>
          )}
        </PagerDutyTestEventDialogController>
      )}
    </DialogController>
  );
}
