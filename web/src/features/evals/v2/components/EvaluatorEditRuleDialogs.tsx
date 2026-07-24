import { ConfirmDialog } from "@/src/components/ui/confirm-dialog";

type EvaluationRule = {
  name: string;
};

export function ConfirmEvaluationRuleDetachmentDialog({
  rule,
  isOnlyAttachedRule,
  open,
  onOpenChange,
  onConfirm,
  loading = false,
}: {
  rule: Pick<EvaluationRule, "name"> | null;
  isOnlyAttachedRule: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  loading?: boolean;
}) {
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Detach evaluator from rule?"
      description={
        rule
          ? `The evaluator will stop running on incoming traces matched by “${rule.name}”.${isOnlyAttachedRule ? " Since this is its only evaluation rule, the evaluator will become inactive." : ""} The evaluation rule itself will not be deleted.`
          : undefined
      }
      confirmLabel="Detach evaluator"
      loading={loading}
      onConfirm={onConfirm}
    />
  );
}
