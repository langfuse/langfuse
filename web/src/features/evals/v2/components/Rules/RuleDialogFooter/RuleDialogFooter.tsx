import { useStore } from "zustand";
import { Button } from "@/src/components/ui/button";
import { DialogFooter } from "@/src/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import {
  type createRuleSetupStore,
  isRuleDraftDirty,
} from "@/src/features/evals/v2/stores/createRuleSetupStore";
import { useTranslations } from "next-intl";

export function RuleDialogFooter({
  ruleSetupStore,
  mutationPending,
  nameGenerationPending,
  isEditing,
  canEdit,
  nameAIAssistanceAvailable,
  onCancel,
  onSave,
}: {
  ruleSetupStore: ReturnType<typeof createRuleSetupStore>;
  mutationPending: boolean;
  nameGenerationPending: boolean;
  isEditing: boolean;
  canEdit: boolean;
  nameAIAssistanceAvailable: boolean;
  onCancel: () => void;
  onSave: () => void;
}) {
  const t = useTranslations("evaluationAnalytics.evaluations");
  const name = useStore(ruleSetupStore, (state) => state.name);
  const dirty = useStore(ruleSetupStore, isRuleDraftDirty);
  const nameMissing = !name.trim();
  const saveButton = (
    <Button
      type="button"
      loading={mutationPending || nameGenerationPending}
      loadingText={
        nameGenerationPending
          ? t("rules.footer.generatingName")
          : t("rules.footer.validatingRule")
      }
      disabled={
        !canEdit ||
        (isEditing && !dirty) ||
        (nameMissing && !nameAIAssistanceAvailable) ||
        mutationPending ||
        nameGenerationPending
      }
      className={
        nameMissing && !nameAIAssistanceAvailable
          ? "pointer-events-none"
          : undefined
      }
      onClick={onSave}
    >
      {isEditing
        ? t("rules.footer.saveChanges")
        : t("rules.footer.saveActivate")}
    </Button>
  );

  return (
    <DialogFooter>
      <Button type="button" variant="outline" onClick={onCancel}>
        {dirty ? t("cancel") : t("close")}
      </Button>
      {nameMissing && !nameAIAssistanceAvailable && canEdit ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex cursor-not-allowed">{saveButton}</span>
          </TooltipTrigger>
          <TooltipContent>{t("rules.footer.nameRequired")}</TooltipContent>
        </Tooltip>
      ) : (
        saveButton
      )}
    </DialogFooter>
  );
}
