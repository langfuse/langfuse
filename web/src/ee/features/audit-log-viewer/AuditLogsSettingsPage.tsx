import Header from "@/src/components/layouts/header";
import { Alert, AlertDescription, AlertTitle } from "@/src/components/ui/alert";
import { AuditLogsTable } from "@/src/ee/features/audit-log-viewer/AuditLogsTable";
import { useHasEntitlement } from "@/src/features/entitlements/hooks";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { useTranslations } from "next-intl";

export function AuditLogsSettingsPage(props: { projectId: string }) {
  const t = useTranslations("settingsEnterprise.auditLogs");
  const hasAccess = useHasProjectAccess({
    projectId: props.projectId,
    scope: "auditLogs:read",
  });
  const hasEntitlement = useHasEntitlement("audit-logs");

  const body = !hasEntitlement ? (
    <p className="text-muted-foreground text-sm">{t("projectUpgrade")}</p>
  ) : !hasAccess ? (
    <Alert>
      <AlertTitle>{t("accessDenied")}</AlertTitle>
      <AlertDescription>{t("projectAccess")}</AlertDescription>
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
