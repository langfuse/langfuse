import Header from "@/src/components/layouts/header";
import { Alert, AlertDescription, AlertTitle } from "@/src/components/ui/alert";
import { AuditLogsTable } from "@/src/ee/features/audit-log-viewer/AuditLogsTable";
import { useHasEntitlement } from "@/src/features/entitlements/hooks";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";

export function AuditLogsSettingsPage(props: { projectId: string }) {
  const hasAccess = useHasProjectAccess({
    projectId: props.projectId,
    scope: "auditLogs:read",
  });
  const hasEntitlement = useHasEntitlement("audit-logs");

  const body = !hasEntitlement ? (
    <p className="text-sm text-muted-foreground">
      Audit logs are an Enterprise feature. Upgrade your plan to track all
      changes made to your project.
    </p>
  ) : !hasAccess ? (
    <Alert>
      <AlertTitle>Access Denied</AlertTitle>
      <AlertDescription>
        Contact your project administrator to request access.
      </AlertDescription>
    </Alert>
  ) : (
    <AuditLogsTable projectId={props.projectId} />
  );

  return (
    <>
      <Header title="Audit Logs" />
      <p className="mb-2 text-sm text-muted-foreground">
        Track who changed what in your project and when. Monitor settings,
        configurations, and data changes over time. Reach out to the Langfuse
        team if you require more detailed/filtered audit logs.
      </p>
      {body}
    </>
  );
}
