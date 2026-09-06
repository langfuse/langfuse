import Header from "@/src/components/layouts/header";
import { Alert, AlertDescription, AlertTitle } from "@/src/components/ui/alert";
import { AuditLogsTable } from "@/src/ee/features/audit-log-viewer/AuditLogsTable";
import { useHasEntitlement } from "@/src/features/entitlements/hooks";
import { useHasOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";
import { useTranslations } from "next-intl";

export function OrgAuditLogsSettingsPage(props: { orgId: string }) {
  const t = useTranslations("settingsEnterprise.auditLogs");
  const hasAccess = useHasOrganizationAccess({
    organizationId: props.orgId,
    scope: "auditLogs:read",
  });
  const hasEntitlement = useHasEntitlement("audit-logs");

  const body = !hasEntitlement ? (
    <p className="text-muted-foreground text-sm">{t("organizationUpgrade")}</p>
  ) : !hasAccess ? (
    <Alert>
      <AlertTitle>{t("accessDenied")}</AlertTitle>
      <AlertDescription>{t("organizationAccess")}</AlertDescription>
    </Alert>
  ) : (
    <AuditLogsTable scope="organization" orgId={props.orgId} />
  );

  return (
    <>
      <Header title={t("organizationTitle")} />
      <p className="text-muted-foreground mb-2 text-sm">
        {t("organizationDescription")}
      </p>
      {body}
    </>
  );
}
