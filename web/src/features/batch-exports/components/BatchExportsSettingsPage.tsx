import Header from "@/src/components/layouts/header";
import { Alert } from "@/src/components/design-system/Alert/Alert";
import { ConnectedBatchExportsTable } from "@/src/features/batch-exports/components/BatchExportsTable/ConnectedBatchExportsTable";
import { useHasProjectAccess } from "@/src/features/rbac";

export function BatchExportsSettingsPage(props: { projectId: string }) {
  const hasAccess = useHasProjectAccess({
    projectId: props.projectId,
    scope: "batchExports:read",
  });

  return (
    <>
      <Header title="Exports" />
      <p className="mb-4 text-sm">
        Export large datasets in your preferred format via the export buttons
        across Langfuse. Exports are processed asynchronously and remain
        available for download until the expiry shown for each export below. You
        will receive an email notification once your export is ready.
      </p>
      {hasAccess ? (
        <ConnectedBatchExportsTable projectId={props.projectId} />
      ) : (
        <Alert>
          <Alert.Title>Access Denied</Alert.Title>
          <Alert.Description>
            You do not have permission to view batch exports.
          </Alert.Description>
        </Alert>
      )}
    </>
  );
}
