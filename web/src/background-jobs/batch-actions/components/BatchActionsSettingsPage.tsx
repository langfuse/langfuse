import Header from "@/src/app/shell/layouts/header";
import { Alert } from "@/src/app/design-system/Alert/Alert";
import { useHasProjectAccess } from "@/src/identity/access-control";
import { ConnectedBatchActionsTable } from "./BatchActionsTable/ConnectedBatchActionsTable";

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
        <ConnectedBatchActionsTable projectId={props.projectId} />
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
