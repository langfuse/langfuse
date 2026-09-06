import { ConfirmDialog } from "@/src/components/ui/confirm-dialog";
import { useTranslations } from "next-intl";

export interface DeleteAutomationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isPending: boolean;
  onConfirm: () => void;
}

export function DeleteAutomationDialog({
  open,
  onOpenChange,
  isPending,
  onConfirm,
}: DeleteAutomationDialogProps) {
  const t = useTranslations("remainderUi.automations.deleteDialog");

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("title")}
      description={t("description")}
      confirmLabel={t("confirm")}
      loading={isPending}
      onConfirm={onConfirm}
    />
  );
}
