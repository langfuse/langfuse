import { ConfirmDialog } from "@/src/components/ui/confirm-dialog";
import { useTranslations } from "next-intl";

export function EvaluatorVersionConflictDialog({
  open,
  isOverriding,
  onOpenChange,
  onDiscard,
  onOverride,
}: {
  open: boolean;
  isOverriding: boolean;
  onOpenChange: (open: boolean) => void;
  onDiscard: () => void | Promise<void>;
  onOverride: () => void | Promise<void>;
}) {
  const t = useTranslations("evaluationAnalytics.evaluations");

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("evaluator.versionConflict.title")}
      description={t("evaluator.versionConflict.description")}
      cancelLabel={t("evaluator.versionConflict.discard")}
      onCancel={onDiscard}
      confirmLabel={t("evaluator.versionConflict.override")}
      confirmVariant="default"
      loading={isOverriding}
      onConfirm={onOverride}
    />
  );
}
