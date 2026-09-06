import Header from "@/src/components/layouts/header";
import { Alert } from "@/src/components/design-system/Alert/Alert";
import { BatchExportsTable } from "@/src/features/batch-exports/components/BatchExportsTable";
import { useHasProjectAccess } from "@/src/features/rbac";
import { SettingsTableCard } from "@/src/components/layouts/settings-table-card";
import { useTranslations } from "next-intl";

export function BatchExportsSettingsPage(props: { projectId: string }) {
  const t = useTranslations("auxSettings.batchExports");
  const hasAccess = useHasProjectAccess({
    projectId: props.projectId,
    scope: "batchExports:read",
  });

  return (
    <>
      <Header title={t("title")} />
      <p className="mb-4 text-sm">{t("description")}</p>
      {hasAccess ? (
        <SettingsTableCard>
          <BatchExportsTable projectId={props.projectId} />
        </SettingsTableCard>
      ) : (
        <Alert>
          <Alert.Title>{t("accessDeniedTitle")}</Alert.Title>
          <Alert.Description>{t("accessDeniedDescription")}</Alert.Description>
        </Alert>
      )}
    </>
  );
}
