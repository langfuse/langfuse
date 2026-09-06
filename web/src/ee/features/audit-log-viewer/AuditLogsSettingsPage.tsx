import Header from "@/src/components/layouts/header";
import { Alert } from "@/src/components/design-system/Alert/Alert";
import { AuditLogsTable } from "@/src/ee/features/audit-log-viewer/AuditLogsTable";
import { useHasEntitlement } from "@/src/features/entitlements/hooks";
import { useTranslations } from "next-intl";
import { useHasProjectAccess } from "@/src/features/rbac";

export function AuditLogsSettingsPage(props: { projectId: string }) {
  const t = useTranslations("settingsEnterprise.auditLogs");
  const hasAccess = useHasProjectAccess({
    projectId: props.projectId,
    scope: "projectAuditLogs:read",
  });
  const hasEntitlement = useHasEntitlement("audit-logs");

  const body = !hasEntitlement ? (
    <p className="text-muted-foreground text-sm">{t("projectUpgrade")}</p>
  ) : !hasAccess ? (
    <Alert>
      <Alert.Title>{t("accessDenied")}</Alert.Title>
      <Alert.Description>{t("projectAccess")}</Alert.Description>
    </Alert>
  ) : (
    <AuditLogsTable scope="project" projectId={props.projectId} />
  );

  return (
    <>
      <Header title={t("title")} />
      <p className="text-muted-foreground mb-2 text-sm">
        {t("projectDescription")}
      </p>
      {body}
    </>
  );
}
