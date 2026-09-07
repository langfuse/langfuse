import Header from "@/src/components/layouts/header";
import { Alert } from "@/src/components/design-system/Alert/Alert";
import { AuditLogsTable } from "@/src/ee/features/audit-log-viewer/AuditLogsTable";
import { useHasEntitlement } from "@/src/features/entitlements/hooks";
import { useHasOrganizationAccess } from "@/src/features/rbac";

export function OrgAuditLogsSettingsPage(props: { orgId: string }) {
  const hasAccess = useHasOrganizationAccess({
    organizationId: props.orgId,
    scope: "orgAuditLogs:read",
  });
  const hasEntitlement = useHasEntitlement("audit-logs");

  const body = !hasEntitlement ? (
    <p className="text-muted-foreground text-sm">
      Audit logs are an Enterprise feature. Upgrade your plan to track all
      changes made to your organization.
    </p>
  ) : !hasAccess ? (
    <Alert>
      <Alert.Title>Access Denied</Alert.Title>
      <Alert.Description>
        Contact your organization administrator to request access.
      </Alert.Description>
    </Alert>
  ) : (
    <AuditLogsTable scope="organization" orgId={props.orgId} />
  );

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
