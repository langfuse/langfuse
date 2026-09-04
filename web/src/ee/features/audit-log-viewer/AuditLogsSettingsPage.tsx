import Header from "@/src/components/layouts/header";
import { Alert } from "@/src/components/design-system/Alert/Alert";
import { AuditLogsTable } from "@/src/ee/features/audit-log-viewer/AuditLogsTable";
import { useHasEntitlement } from "@/src/features/entitlements/hooks";
import { useHasProjectAccess } from "@/src/features/rbac";

export function AuditLogsSettingsPage(props: { projectId: string }) {
  const hasAccess = useHasProjectAccess({
    projectId: props.projectId,
    scope: "projectAuditLogs:read",
  });
  const hasEntitlement = useHasEntitlement("audit-logs");

  const body = !hasEntitlement ? (
    <p className="text-muted-foreground text-sm">
      Audit logs are an Enterprise feature. Upgrade your plan to track all
      changes made to your project.
    </p>
  ) : !hasAccess ? (
    <Alert>
      <Alert.Title>Access Denied</Alert.Title>
      <Alert.Description>
        Contact your project administrator to request access.
      </Alert.Description>
    </Alert>
  ) : (
    <AuditLogsTable scope="project" projectId={props.projectId} />
  );

  return (
    <>
      <Header title="Audit Logs" />
      <p className="text-muted-foreground mb-2 text-sm">
        Track who changed what in your project and when. Monitor settings,
        configurations, and data changes over time. Reach out to the Langfuse
        team if you require more detailed/filtered audit logs.
      </p>
      {body}
    </>
  );
}
