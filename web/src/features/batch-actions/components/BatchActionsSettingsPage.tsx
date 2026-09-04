import Header from "@/src/components/layouts/header";
import { Alert } from "@/src/components/design-system/Alert/Alert";
import { SettingsTableCard } from "@/src/components/layouts/settings-table-card";
import { useHasProjectAccess } from "@/src/features/rbac";
import { BatchActionsTable } from "./BatchActionsTable";

export function BatchActionsSettingsPage(props: { projectId: string }) {
  const hasAccess = useHasProjectAccess({
    projectId: props.projectId,
    scope: "datasets:CUD",
  });

  return (
    <>
      <Header title="Batch Actions" />
      <p className="mb-4 text-sm">
        Track the status of bulk operations performed on tables, such as adding
        observations to datasets, deleting traces, and adding items to
        annotation queues. Actions are processed asynchronously in the
        background.
      </p>
      {hasAccess ? (
        <SettingsTableCard>
          <BatchActionsTable projectId={props.projectId} />
        </SettingsTableCard>
      ) : (
        <Alert>
          <Alert.Title>Access Denied</Alert.Title>
          <Alert.Description>
            You do not have permission to view batch actions.
          </Alert.Description>
        </Alert>
      )}
    </>
  );
}
