import type { ReactNode } from "react";

import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { GatewayBudgetDialog } from "@/src/features/ai-gateway/components/GatewayBudgetsPage/components/GatewayBudgetDialog/GatewayBudgetDialog";
import { useSetGatewayOrganizationBudget } from "@/src/features/ai-gateway/components/GatewayBudgetsPage/hooks/useSetGatewayOrganizationBudget";
import { useGatewaySettingsAccess } from "@/src/features/ai-gateway/hooks/useGatewaySettingsAccess";
import type { GatewaySpendLimit } from "@/src/features/ai-gateway/types/gatewaySpendLimit";

const DESCRIPTION =
  "Caps total gateway spend in this organization, across all members and keys. Key and user budgets still apply.";

/** The budget being edited; null adds one. */
type GatewayEditedOrganizationBudget = {
  id: string;
  spendLimit: GatewaySpendLimit;
} | null;

type GatewayOrganizationBudgetDialogControllerProps = {
  organizationId: string;
  children: (control: {
    openDialog: (budget: GatewayEditedOrganizationBudget) => void;
  }) => ReactNode;
};

/** Adds, edits or removes one of the organization's own budgets; the server checks that the caller is a gateway manager. */
export function GatewayOrganizationBudgetDialogController({
  organizationId,
  children,
}: GatewayOrganizationBudgetDialogControllerProps) {
  const { spendBudgetUnavailableReason } =
    useGatewaySettingsAccess(organizationId);
  const { setBudget, mutation } =
    useSetGatewayOrganizationBudget(organizationId);

  const save = async (
    budget: GatewayEditedOrganizationBudget,
    spendLimit: GatewaySpendLimit | null,
    closeDialog: () => void,
  ) => {
    const saved = await setBudget({ id: budget?.id ?? null, spendLimit });
    if (!saved) return;
    closeDialog();
    mutation.reset();
  };

  return (
    <DialogController<GatewayEditedOrganizationBudget>
      onBeforeClose={() => !mutation.isPending}
      onDismiss={() => mutation.reset()}
      renderDialog={({ state, closeDialog }) => (
        <GatewayBudgetDialog
          title={state ? "Edit organization budget" : "Add organization budget"}
          description={DESCRIPTION}
          subject="organization"
          spendLimit={state?.spendLimit ?? null}
          saveLabel={state ? "Save changes" : "Add budget"}
          removeLabel={state ? "Remove budget" : undefined}
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
