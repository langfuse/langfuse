import Header from "@/src/components/layouts/header";
import { Banner } from "@/src/components/design-system/Banner/Banner";
import { ConnectedAuditLogsTable } from "@/src/ee/features/audit-log-viewer/AuditLogsTable/ConnectedAuditLogsTable";
import { useHasEntitlement } from "@/src/features/entitlements/hooks";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";

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
        <Banner title="Access denied">
          Contact your project administrator to request access.
        </Banner>
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
