import type { ReactNode } from "react";

import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { GatewayBudgetDialog } from "@/src/features/ai-gateway/components/GatewayBudgetsPage/components/GatewayBudgetDialog/GatewayBudgetDialog";
import { useCaptureGatewayBudgetChange } from "@/src/features/ai-gateway/hooks/useCaptureGatewayBudgetChange";
import { useGatewayOrganizationBudget } from "@/src/features/ai-gateway/hooks/useGatewayOrganizationBudget";
import { useSetGatewayOrganizationBudget } from "@/src/features/ai-gateway/hooks/useSetGatewayOrganizationBudget";
import { useGatewaySettingsAccess } from "@/src/features/ai-gateway/hooks/useGatewaySettingsAccess";
import type { GatewaySpendLimit } from "@/src/features/ai-gateway/types/gatewaySpendLimit";

type GatewayOrganizationBudgetDialogControllerProps = {
  organizationId: string;
  children: (control: {
    openDialog: () => void;
    /** The current budget with its spend: undefined while loading, null when none is set. */
    organizationBudget: ReturnType<typeof useGatewayOrganizationBudget>;
  }) => ReactNode;
};

/** Sets or removes the organization's own budget; the server checks that the caller is a gateway manager. */
export function GatewayOrganizationBudgetDialogController({
  organizationId,
  children,
}: GatewayOrganizationBudgetDialogControllerProps) {
  const { spendBudgetUnavailableReason } =
    useGatewaySettingsAccess(organizationId);
  const organizationBudget = useGatewayOrganizationBudget(organizationId);
  const { setBudget, mutation } =
    useSetGatewayOrganizationBudget(organizationId);
  const captureBudgetChange = useCaptureGatewayBudgetChange(organizationId);

  const save = async (
    spendLimit: GatewaySpendLimit | null,
    closeDialog: () => void,
  ) => {
    const saved = await setBudget(spendLimit);
    if (!saved) return;
    captureBudgetChange({
      surface: "budgets_page",
      scope: "ORGANIZATION",
      subjectCount: 1,
      spendLimit,
    });
    closeDialog();
    mutation.reset();
  };

  return (
    <DialogController
      onBeforeClose={() => !mutation.isPending}
      onDismiss={() => mutation.reset()}
      renderDialog={({ closeDialog }) => (
        <GatewayBudgetDialog
          title="Organization budget"
          description="Caps total gateway spend in this organization, across all members and keys. Key and user budgets still apply; whichever is reached first blocks the request."
          subject="organization"
          spendLimit={organizationBudget?.spendLimit ?? null}
          saveLabel="Save budget"
          removeLabel={organizationBudget ? "Remove budget" : undefined}
          unavailableReason={spendBudgetUnavailableReason}
          errorMessage={
            mutation.isError ? (mutation.error?.message ?? "Try again.") : null
          }
          isSubmitting={mutation.isPending}
          onSubmit={(spendLimit) => save(spendLimit, closeDialog)}
          onRemove={() => save(null, closeDialog)}
        />
      )}
    >
      {({ openDialog }) => children({ openDialog, organizationBudget })}
    </DialogController>
  );
}
