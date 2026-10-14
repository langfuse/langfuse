import Header from "@/src/app/shell/layouts/header";
import { Alert } from "@/src/app/design-system/Alert/Alert";
import { ConnectedAuditLogsTable } from "@/src/ee/identity/audit-logs/viewer/AuditLogsTable/ConnectedAuditLogsTable";
import { useHasEntitlement } from "@/src/entitlements";
import { useHasProjectAccess } from "@/src/identity/access-control";

export function AuditLogsSettingsPage(props: { projectId: string }) {
  const hasAccess = useHasProjectAccess({
    projectId: props.projectId,
    scope: "projectAuditLogs:read",
  });
  const hasEntitlement = useHasEntitlement("audit-logs");

  const body = (() => {
    if (!hasEntitlement) {
      return (
        <p className="text-muted-foreground text-sm">
          Audit logs are an Enterprise feature. Upgrade your plan to track all
          changes made to your project.
        </p>
      );
    }
    if (!hasAccess) {
      return (
        <Alert>
          <Alert.Title>Access Denied</Alert.Title>
          <Alert.Description>
            Contact your project administrator to request access.
          </Alert.Description>
        </Alert>
      );
    }
    return (
      <ConnectedAuditLogsTable scope="project" projectId={props.projectId} />
    );
  })();

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
