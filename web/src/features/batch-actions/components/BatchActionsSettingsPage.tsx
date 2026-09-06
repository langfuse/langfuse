import Header from "@/src/components/layouts/header";
import { Alert, AlertDescription, AlertTitle } from "@/src/components/ui/alert";
import { SettingsTableCard } from "@/src/components/layouts/settings-table-card";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
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
          <AlertTitle>{t("accessDeniedTitle")}</AlertTitle>
          <AlertDescription>{t("accessDeniedDescription")}</AlertDescription>
        </Alert>
      )}
    </>
  );
}
