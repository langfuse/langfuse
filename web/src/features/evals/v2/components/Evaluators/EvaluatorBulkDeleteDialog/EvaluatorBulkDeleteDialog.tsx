import { ConfirmDialog } from "@/src/components/ui/confirm-dialog";
import { useTranslations } from "next-intl";

export function EvaluatorBulkDeleteDialog({
  open,
  scope,
  isDeleting,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  scope: "selected" | "allMatching";
  isDeleting: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void | Promise<void>;
}) {
  const t = useTranslations("evaluationAnalytics.evaluations");

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={
        scope === "allMatching"
          ? t("evaluator.bulkDelete.allMatchingTitle")
          : t("evaluator.bulkDelete.selectedTitle")
      }
      description={t("evaluator.bulkDelete.description")}
      confirmLabel={t("evaluator.bulkDelete.confirm")}
      loading={isDeleting}
      onConfirm={onConfirm}
    />
  );
}
