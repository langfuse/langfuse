import type { ReactNode } from "react";

import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { GatewayEditBudgetDialog } from "@/src/features/ai-gateway/components/GatewayBudgetsPage/components/GatewayBudgetsTabContent/components/GatewayBudgetsTable/components/GatewayEditBudgetDialogController/components/GatewayEditBudgetDialog/GatewayEditBudgetDialog";
import {
  GATEWAY_SPEND_TABS,
  type GatewaySpendTab,
} from "@/src/features/ai-gateway/components/GatewayBudgetsPage/constants/gatewaySpendTabs";
import {
  type GatewayBudgetTarget,
  useSetGatewayBudgets,
} from "@/src/features/ai-gateway/components/GatewayBudgetsPage/hooks/useSetGatewayBudgets";
import { useGatewaySettingsAccess } from "@/src/features/ai-gateway/hooks/useGatewaySettingsAccess";
import type { GatewaySpendLimit } from "@/src/features/ai-gateway/types/gatewaySpendLimit";

export type GatewayEditedBudgets = {
  tab: GatewaySpendTab;
  /** The keys or users whose budgets change together. */
  target: GatewayBudgetTarget;
  count: number;
  /** Shown when only one key or user changes. */
  name?: string;
  /** Prefills the form; null when the first of them has no budget yet. */
  spendLimit: GatewaySpendLimit | null;
  /** How many of them already have a budget that saving replaces; null when unknown. */
  existingBudgetCount: number | null;
  onSaved?: () => void;
};

type GatewayEditBudgetDialogControllerProps = {
  organizationId: string;
  children: (control: {
    openDialog: (budgets: GatewayEditedBudgets) => void;
  }) => ReactNode;
};

/** Updates or deletes key or user budgets; the server checks who may. */
export function GatewayEditBudgetDialogController({
  organizationId,
  children,
}: GatewayEditBudgetDialogControllerProps) {
  const { spendBudgetUnavailableReason } =
    useGatewaySettingsAccess(organizationId);
  const { setBudgets, mutation } = useSetGatewayBudgets(organizationId);

  const save = async (
    budgets: GatewayEditedBudgets,
    spendLimit: GatewaySpendLimit | null,
    closeDialog: () => void,
  ) => {
    const saved = await setBudgets({
      tab: budgets.tab,
      subjects: budgets.target,
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
          subject={GATEWAY_SPEND_TABS[state.tab].subject}
          subjectCount={state.count}
          subjectName={state.name}
          spendLimit={state.spendLimit}
          existingBudgetCount={state.existingBudgetCount}
          unavailableReason={spendBudgetUnavailableReason}
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
