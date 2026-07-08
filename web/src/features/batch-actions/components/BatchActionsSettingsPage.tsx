import Header from "@/src/components/layouts/header";
import { Alert, AlertDescription, AlertTitle } from "@/src/components/ui/alert";
import { SettingsTableCard } from "@/src/components/layouts/settings-table-card";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
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
          <AlertTitle>Access Denied</AlertTitle>
          <AlertDescription>
            You do not have permission to view batch actions.
          </AlertDescription>
        </Alert>
      )}
    </>
  );
}
