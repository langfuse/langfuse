import Header from "@/src/components/layouts/header";
import { Alert, AlertDescription, AlertTitle } from "@/src/components/ui/alert";
import { AuditLogsTable } from "@/src/ee/features/audit-log-viewer/AuditLogsTable";
import { useHasEntitlement } from "@/src/features/entitlements/hooks";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { useTranslation } from "react-i18next";

export function AuditLogsSettingsPage(props: { projectId: string }) {
  const { t } = useTranslation();
  const hasAccess = useHasProjectAccess({
    projectId: props.projectId,
    scope: "auditLogs:read",
  });
  const hasEntitlement = useHasEntitlement("audit-logs");

  const body = !hasEntitlement ? (
    <p className="text-sm text-muted-foreground">
      {t("ee.auditLogs.enterpriseFeature")}
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
      <Header title={t("ee.auditLogs.title")} />
      <p className="mb-2 text-sm text-muted-foreground">
        {t("ee.auditLogs.description")}
      </p>
      {body}
    </>
  );
}
