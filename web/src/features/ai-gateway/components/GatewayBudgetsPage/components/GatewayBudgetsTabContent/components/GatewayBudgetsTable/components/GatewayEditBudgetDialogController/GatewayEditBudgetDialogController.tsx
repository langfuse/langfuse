import type { ReactNode } from "react";

import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { GatewayEditBudgetDialog } from "@/src/features/ai-gateway/components/GatewayBudgetsPage/components/GatewayEditBudgetDialog/GatewayEditBudgetDialog";
import {
  type GatewayBudgetSubject,
  type GatewaySpendLimit,
  useSetGatewayBudgets,
} from "@/src/features/ai-gateway/components/GatewayBudgetsPage/hooks/useSetGatewayBudgets";
import { useGatewayDefaultBudget } from "@/src/features/ai-gateway/hooks/useGatewayDefaultBudget";
import { useGatewaySettingsAccess } from "@/src/features/ai-gateway/hooks/useGatewaySettingsAccess";

export type GatewayEditedBudgets = {
  subject: GatewayBudgetSubject;
  /** The keys or users whose budgets change together. */
  subjects: { id: string; name: string }[];
  /** Prefills the form; null when the first of them has no budget yet. */
  spendLimit: GatewaySpendLimit | null;
  /** How many of the subjects already have a budget that saving replaces. */
  existingBudgetCount: number;
  onSaved?: () => void;
};

type GatewayEditBudgetDialogControllerProps = {
  organizationId: string;
  subject: GatewayBudgetSubject;
  children: (control: {
    openDialog: (budgets: GatewayEditedBudgets) => void;
  }) => ReactNode;
};

/** Updates or deletes key or user budgets; the server checks who may. */
export function GatewayEditBudgetDialogController({
  organizationId,
  subject,
  children,
}: GatewayEditBudgetDialogControllerProps) {
  const { isRecording } = useGatewaySettingsAccess(organizationId);
  const { setBudgets, mutation } = useSetGatewayBudgets(organizationId);
  const defaultBudget = useGatewayDefaultBudget(organizationId, subject);

  const save = async (
    budgets: GatewayEditedBudgets,
    spendLimit: GatewaySpendLimit | null,
    closeDialog: () => void,
  ) => {
    const saved = await setBudgets({
      subject: budgets.subject,
      subjectIds: budgets.subjects.map(({ id }) => id),
      spendLimit,
    });
    if (!saved) return;
    budgets.onSaved?.();
    closeDialog();
    mutation.reset();
  };

  return (
    <DialogController<GatewayEditedBudgets>
      onBeforeClose={() => !mutation.isPending}
      onDismiss={() => mutation.reset()}
      renderDialog={({ state, closeDialog }) => (
        <GatewayEditBudgetDialog
          subject={state.subject}
          subjectNames={state.subjects.map(({ name }) => name)}
          spendLimit={state.spendLimit}
          existingBudgetCount={state.existingBudgetCount}
          removeLabel={getRemoveLabel(state, Boolean(defaultBudget))}
          unavailableReason={
            isRecording === false
              ? "Spend budgets need recorded gateway requests. Switch the gateway ingestion to usage to change one."
              : undefined
          }
          errorMessage={
            mutation.isError ? (mutation.error?.message ?? "Try again.") : null
          }
          isSubmitting={mutation.isPending}
          onSubmit={(spendLimit) => save(state, spendLimit, closeDialog)}
          onRemove={() => save(state, null, closeDialog)}
        />
      )}
    >
      {({ openDialog }) => children({ openDialog })}
    </DialogController>
  );
}

/** Removing a budget falls back to the default, so the action says so while one is set. */
function getRemoveLabel(budgets: GatewayEditedBudgets, hasDefault: boolean) {
  const isBulk = budgets.subjects.length > 1;
  if (!isBulk && budgets.existingBudgetCount === 0) return undefined;
  if (hasDefault) return isBulk ? "Use default budgets" : "Use default budget";
  return isBulk ? "Remove budgets" : "Remove budget";
}
