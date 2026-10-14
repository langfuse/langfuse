import Header from "@/src/app/shell/layouts/header";
import { Alert } from "@/src/app/design-system/Alert/Alert";
import { ConnectedAuditLogsTable } from "@/src/ee/identity/audit-logs/viewer/AuditLogsTable/ConnectedAuditLogsTable";
import { useHasEntitlement } from "@/src/entitlements";
import { useHasOrganizationAccess } from "@/src/identity/access-control";

export function OrgAuditLogsSettingsPage(props: { orgId: string }) {
  const hasAccess = useHasOrganizationAccess({
    organizationId: props.orgId,
    scope: "orgAuditLogs:read",
  });
  const hasEntitlement = useHasEntitlement("audit-logs");

  const body = (() => {
    if (!hasEntitlement) {
      return (
        <p className="text-muted-foreground text-sm">
          Audit logs are an Enterprise feature. Upgrade your plan to track all
          changes made to your organization.
        </p>
      );
    }
    if (!hasAccess) {
      return (
        <Alert>
          <Alert.Title>Access Denied</Alert.Title>
          <Alert.Description>
            Contact your organization administrator to request access.
          </Alert.Description>
        </Alert>
      );
    }
    return <ConnectedAuditLogsTable scope="organization" orgId={props.orgId} />;
  })();

  return (
    <>
      <Header title="Organization Audit Logs" />
      <p className="text-muted-foreground mb-2 text-sm">
        Track who changed what in your organization and when. Monitor
        organization settings, project creation/deletion, and membership changes
        over time.
      </p>
      {body}
    </>
  );
}
