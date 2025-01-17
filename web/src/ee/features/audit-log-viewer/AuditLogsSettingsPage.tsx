import Header from "@/src/components/layouts/header";
import { Alert, AlertDescription, AlertTitle } from "@/src/components/ui/alert";
import { AuditLogsTable } from "@/src/ee/features/audit-log-viewer/AuditLogsTable";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";

export function AuditLogsSettingsPage(props: { projectId: string }) {
  const hasAccess = useHasProjectAccess({
    projectId: props.projectId,
    scope: "auditLogs:read",
  });

  return (
    <>
      <Header title="Audit Logs" level="h3" />
      <p className="mb-4 text-sm">
        View a history of changes made to your project's resources. Audit logs
        help you track who made what changes and when.
      </p>
      {hasAccess ? (
        <AuditLogsTable projectId={props.projectId} />
      ) : (
        <Alert>
          <AlertTitle>Access Denied</AlertTitle>
          <AlertDescription>
            You do not have permission to view audit logs.
          </AlertDescription>
        </Alert>
      )}
    </>
  );
}
