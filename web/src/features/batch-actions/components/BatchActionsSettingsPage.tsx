import Header from "@/src/components/layouts/header";
import { Alert } from "@/src/components/design-system/Alert/Alert";
import { SettingsTableCard } from "@/src/components/layouts/settings-table-card";
import { useHasProjectAccess } from "@/src/features/rbac";
import { BatchActionsTable } from "./BatchActionsTable";
import { useTranslations } from "next-intl";

export function BatchActionsSettingsPage(props: { projectId: string }) {
  const t = useTranslations("auxSettings.batchActions");
  const hasAccess = useHasProjectAccess({
    projectId: props.projectId,
    scope: "datasets:CUD",
  });

  return (
    <>
      <Header title={t("title")} />
      <p className="mb-4 text-sm">{t("description")}</p>
      {hasAccess ? (
        <SettingsTableCard>
          <BatchActionsTable projectId={props.projectId} />
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
