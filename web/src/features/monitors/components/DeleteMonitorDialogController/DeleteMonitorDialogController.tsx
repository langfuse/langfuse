import type { ComponentProps } from "react";
import { ConfirmationDialogController } from "@/src/components/design-system/ConfirmationDialogController/ConfirmationDialogController";

export function DeleteMonitorDialogController({
  children,
  monitorName,
  deleting,
  onDelete,
}: {
  children: ComponentProps<typeof ConfirmationDialogController>["children"];
  monitorName: string;
  deleting: boolean;
  onDelete: () => Promise<void>;
}) {
  return (
    <ConfirmationDialogController
      title="Delete alert"
      text={`This permanently deletes "${monitorName}". This action cannot be undone.`}
      confirmLabel="Delete alert"
      variant="destructive"
      loading={deleting}
      onConfirm={onDelete}
    >
      {children}
    </ConfirmationDialogController>
  );
}
