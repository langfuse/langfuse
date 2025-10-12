import { Button } from "@/src/components/ui/button";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { UpsertModelFormDrawer } from "@/src/features/models/components/UpsertModelFormDrawer";
import { type GetModelResult } from "@/src/features/models/validation";
import { useTranslation } from "react-i18next";

export const EditModelButton = ({
  modelData,
  projectId,
}: {
  modelData: GetModelResult;
  projectId: string;
}) => {
  const { t } = useTranslation();
  const hasAccess = useHasProjectAccess({
    projectId,
    scope: "models:CUD",
  });

  return (
    <UpsertModelFormDrawer {...{ modelData, projectId, action: "edit" }}>
      <Button
        variant="outline"
        disabled={!hasAccess}
        title={t("common.actions.edit")}
        className="flex items-center"
      >
        <span>{t("common.actions.edit")}</span>
      </Button>
    </UpsertModelFormDrawer>
  );
};
