import { Button } from "@/src/components/ui/button";
import { useHasProjectAccess } from "@/src/features/rbac";
import { UpsertModelFormDialog } from "@/src/features/models/components/UpsertModelFormDialog/UpsertModelFormDialog";
import { type GetModelResult } from "@/src/features/models/validation";
import { useTranslations } from "next-intl";

export const EditModelButton = ({
  modelData,
  projectId,
}: {
  modelData: GetModelResult;
  projectId: string;
}) => {
  const t = useTranslations("settingsEnterprise.models.actions");
  const hasAccess = useHasProjectAccess({
    projectId,
    scope: "models:CUD",
  });

  return (
    <UpsertModelFormDialog {...{ modelData, projectId, action: "edit" }}>
      <Button
        variant="outline"
        disabled={!hasAccess}
        title={t("editTitle")}
        className="flex items-center"
      >
        <span>{t("edit")}</span>
      </Button>
    </UpsertModelFormDialog>
  );
};
