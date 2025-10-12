import Header from "@/src/components/layouts/header";
import { Alert, AlertDescription, AlertTitle } from "@/src/components/ui/alert";
import { BatchExportsTable } from "@/src/features/batch-exports/components/BatchExportsTable";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { SettingsTableCard } from "@/src/components/layouts/settings-table-card";
import { useTranslation } from "react-i18next";

export function BatchExportsSettingsPage(props: { projectId: string }) {
  const { t } = useTranslation();
  const hasAccess = useHasProjectAccess({
    projectId: props.projectId,
    scope: "batchExports:read",
  });

  return (
    <>
      <Header title={t("project.settings.exports.title")} />
      <p className="mb-4 text-sm">
        {t("project.settings.exports.description")}
      </p>
      {hasAccess ? (
        <SettingsTableCard>
          <BatchExportsTable projectId={props.projectId} />
        </SettingsTableCard>
      ) : (
        <Alert>
          <AlertTitle>{t("project.settings.exports.accessDenied")}</AlertTitle>
          <AlertDescription>
            {t("project.settings.exports.noPermission")}
          </AlertDescription>
        </Alert>
      )}
    </>
  );
}
