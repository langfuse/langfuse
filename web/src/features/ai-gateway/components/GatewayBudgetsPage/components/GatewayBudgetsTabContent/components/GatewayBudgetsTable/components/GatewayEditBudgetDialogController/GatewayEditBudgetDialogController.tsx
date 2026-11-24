import type { ReactNode } from "react";

import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { GatewayBudgetDialog } from "@/src/features/ai-gateway/components/GatewayBudgetsPage/components/GatewayBudgetDialog/GatewayBudgetDialog";
import {
  GATEWAY_SPEND_TABS,
  type GatewaySpendTab,
} from "@/src/features/ai-gateway/components/GatewayBudgetsPage/constants/gatewaySpendTabs";
import {
  type GatewayBudgetTarget,
  useSetGatewayBudgets,
} from "@/src/features/ai-gateway/components/GatewayBudgetsPage/hooks/useSetGatewayBudgets";
import { useCaptureGatewayBudgetChange } from "@/src/features/ai-gateway/hooks/useCaptureGatewayBudgetChange";
import { useGatewayDefaultBudget } from "@/src/features/ai-gateway/hooks/useGatewayDefaultBudget";
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
  onAfterSave?: () => void;
};

type GatewayEditBudgetDialogControllerProps = {
  organizationId: string;
  subject: "key" | "user";
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
  const { spendBudgetUnavailableReason } =
    useGatewaySettingsAccess(organizationId);
  const { setBudgets, mutation } = useSetGatewayBudgets(organizationId);
  const defaultBudget = useGatewayDefaultBudget(organizationId, subject);
  const captureBudgetChange = useCaptureGatewayBudgetChange(organizationId);

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
    captureBudgetChange({
      surface: "budgets_page",
      scope: GATEWAY_SPEND_TABS[budgets.tab].scope,
      subjectCount: budgets.count,
      spendLimit,
    });
    budgets.onAfterSave?.();
    closeDialog();
    mutation.reset();
  };

  return (
    <DialogController<GatewayEditedBudgets>
      onBeforeClose={() => !mutation.isPending}
      onDismiss={() => mutation.reset()}
      renderDialog={({ state, closeDialog }) => (
        <GatewayBudgetDialog
          title={getTitle(state)}
          description={<EditedBudgetsDescription budgets={state} />}
          warning={getReplaceWarning(state)}
          subject={GATEWAY_SPEND_TABS[state.tab].subject}
          spendLimit={state.spendLimit}
          saveLabel="Save changes"
          removeLabel={getRemoveLabel(state, Boolean(defaultBudget))}
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

function EditedBudgetsDescription({
  budgets,
}: {
  budgets: GatewayEditedBudgets;
}) {
  const { subject } = GATEWAY_SPEND_TABS[budgets.tab];
  const isBulk = budgets.count > 1;
  const applies = isBulk ? "Each budget applies" : "Applies";
  const name = (
    <span className="text-foreground font-medium">
      {isBulk ? `${budgets.count} ${subject}s` : budgets.name}
    </span>
  );
  if (subject === "user") {
    return (
      <>
        {applies} to every gateway key of {name}, in addition to each key&apos;s
        own budget.
      </>
    );
  }
  return (
    <>
      {applies} to requests with {name}.
    </>
  );
}

function getTitle(budgets: GatewayEditedBudgets) {
  const { subject } = GATEWAY_SPEND_TABS[budgets.tab];
  return budgets.count > 1
    ? `Edit ${budgets.count} ${subject} budgets`
    : `Edit ${subject} budget`;
}

function getReplaceWarning({
  tab,
  count,
  existingBudgetCount,
}: GatewayEditedBudgets) {
  const { subject } = GATEWAY_SPEND_TABS[tab];
  if (count === 1) return undefined;
  if (existingBudgetCount === null) {
    return `Selected ${subject}s that already have a budget get this one instead.`;
  }
  if (existingBudgetCount === 0) return undefined;
  const pronoun = existingBudgetCount === 1 ? "it" : "them";
  if (existingBudgetCount === count) {
    return `All selected ${subject}s already have a budget. Saving replaces ${pronoun} with this one.`;
  }
  return `${existingBudgetCount} of the selected ${subject}s already have a budget. Saving replaces ${pronoun} with this one.`;
}

/** Removing a budget falls back to the default, so the action says so while one is set. */
function getRemoveLabel(budgets: GatewayEditedBudgets, hasDefault: boolean) {
  const isBulk = budgets.count > 1;
  if (!isBulk && budgets.existingBudgetCount === 0) return undefined;
  if (hasDefault) return isBulk ? "Use default budgets" : "Use default budget";
  return isBulk ? "Remove budgets" : "Remove budget";
}
