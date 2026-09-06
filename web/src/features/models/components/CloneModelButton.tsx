import { Button } from "@/src/components/ui/button";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { UpsertModelFormDialog } from "@/src/features/models/components/UpsertModelFormDialog/UpsertModelFormDialog";
import { type GetModelResult } from "@/src/features/models/validation";
import { useTranslations } from "next-intl";

export const CloneModelButton = ({
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
    <UpsertModelFormDialog {...{ modelData, projectId, action: "clone" }}>
      <Button
        variant="outline"
        disabled={!hasAccess}
        title={t("cloneTitle")}
        className="flex items-center"
      >
        <span>{t("clone")}</span>
      </Button>
    </UpsertModelFormDialog>
  );
};
