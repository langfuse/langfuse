import Header from "@/src/components/layouts/header";
import { Alert, AlertDescription, AlertTitle } from "@/src/components/ui/alert";
import { Card } from "@/src/components/ui/card";
import { BatchExportsTable } from "@/src/features/batch-exports/components/BatchExportsTable";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";

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
        available for download for one hour. You will receive an email
        notification once your export is ready.
      </p>
      {hasAccess ? (
        <Card className="mb-4 flex max-h-[60dvh] flex-col overflow-hidden [&>:first-child>:first-child]:border-t-0">
          <BatchExportsTable projectId={props.projectId} />
        </Card>
      ) : (
        <Alert>
          <AlertTitle>Access Denied</AlertTitle>
          <AlertDescription>
            You do not have permission to view batch exports.
          </AlertDescription>
        </Alert>
      )}
    </>
  );
}
