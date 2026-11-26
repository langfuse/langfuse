import { Dialog } from "@/src/components/design-system/Dialog/Dialog";

export function EvaluatorVersionConflictDialog({
  isOverriding,
  onDiscard,
  onOverride,
}: {
  isOverriding: boolean;
  onDiscard: () => void | Promise<void>;
  onOverride: () => void | Promise<void>;
}) {
  return (
    <Dialog
      closeOnInteractionOutside
      size="sm"
      title="This evaluator was updated"
      text="Another user saved a newer version while you were editing. Discard your changes to load the latest version, or override it by saving your changes as the newest version. The other version remains in the version history."
      hideCloseButton
      actions={[
        {
          label: "Discard changes",
          variant: "secondary",
          disabled: isOverriding,
          onClick: onDiscard,
        },
        {
          label: "Override changes",
          loading: isOverriding,
          onClick: onOverride,
        },
      ]}
    />
  );
}
