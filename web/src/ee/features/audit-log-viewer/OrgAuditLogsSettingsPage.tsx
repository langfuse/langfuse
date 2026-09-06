import Header from "@/src/components/layouts/header";
import { Alert } from "@/src/components/design-system/Alert/Alert";
import { AuditLogsTable } from "@/src/ee/features/audit-log-viewer/AuditLogsTable";
import { useHasEntitlement } from "@/src/features/entitlements/hooks";
import { useTranslations } from "next-intl";
import { useHasOrganizationAccess } from "@/src/features/rbac";

export function OrgAuditLogsSettingsPage(props: { orgId: string }) {
  const t = useTranslations("settingsEnterprise.auditLogs");
  const hasAccess = useHasOrganizationAccess({
    organizationId: props.orgId,
    scope: "orgAuditLogs:read",
  });
  const hasEntitlement = useHasEntitlement("audit-logs");

  const body = !hasEntitlement ? (
    <p className="text-muted-foreground text-sm">{t("organizationUpgrade")}</p>
  ) : !hasAccess ? (
    <Alert>
      <Alert.Title>{t("accessDenied")}</Alert.Title>
      <Alert.Description>{t("organizationAccess")}</Alert.Description>
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
