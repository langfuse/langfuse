import Header from "@/src/components/layouts/header";
import { Banner } from "@/src/components/design-system/Banner/Banner";
import { AccessLoggingSwitch } from "@/src/ee/features/access-audit-log/components/AccessLoggingSwitch";
import { useShowAccessLoggingSetting } from "@/src/ee/features/access-audit-log/hooks/useShowAccessLoggingSetting";
import { ConnectedAuditLogsTable } from "@/src/ee/features/audit-log-viewer/AuditLogsTable/ConnectedAuditLogsTable";
import { useHasEntitlement } from "@/src/features/entitlements/hooks";
import { useHasOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";

export function OrgAuditLogsSettingsPage(props: { orgId: string }) {
  const hasAccess = useHasOrganizationAccess({
    organizationId: props.orgId,
    scope: "orgAuditLogs:read",
  });
  const hasEntitlement = useHasEntitlement("audit-logs");
  const showAccessLogging = useShowAccessLoggingSetting();

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
        <Banner title="Access denied">
          Contact your organization administrator to request access.
        </Banner>
      );
    }
    return <ConnectedAuditLogsTable scope="organization" orgId={props.orgId} />;
  })();

  return (
    <div className="flex flex-col gap-6">
      {showAccessLogging && (
        <div>
          <Header title="Access Logging" />
          <AccessLoggingSwitch orgId={props.orgId} />
        </div>
      )}
      <div>
        <Header title="Organization Audit Logs" />
        <p className="text-muted-foreground mb-2 text-sm">
          Track who changed what in your organization and when. Monitor
          organization settings, project creation/deletion, and membership
          changes over time.
        </p>
        {body}
      </div>
    </div>
  );
}
