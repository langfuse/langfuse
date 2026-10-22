import Header, { SubHeader } from "@/src/components/layouts/header";
import { Alert } from "@/src/components/design-system/Alert/Alert";
import { AccessLoggingSwitch } from "@/src/ee/features/access-audit-log";
import { ConnectedAuditLogsTable } from "@/src/ee/features/audit-log-viewer/AuditLogsTable/ConnectedAuditLogsTable";
import { useHasEntitlement } from "@/src/features/entitlements";
import { useInternalFeaturesEnabled } from "@/src/features/feature-flags";
import { useHasOrganizationAccess } from "@/src/features/rbac";

export function OrgAuditLogsSettingsPage(props: { orgId: string }) {
  const hasAccess = useHasOrganizationAccess({
    organizationId: props.orgId,
    scope: "orgAuditLogs:read",
  });
  const hasEntitlement = useHasEntitlement("audit-logs");
  // Internal until read access is recorded on every surface.
  const showAccessLogging = useInternalFeaturesEnabled() && hasEntitlement;

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
      {showAccessLogging && (
        <div className="mb-4">
          <SubHeader title="Access logging" labelBadge="Internal" />
          <AccessLoggingSwitch orgId={props.orgId} />
        </div>
      )}
      {body}
    </>
  );
}
