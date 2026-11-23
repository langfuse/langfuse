import type { ReactNode } from "react";

import { ConfirmationDialogController } from "@/src/components/design-system/ConfirmationDialogController/ConfirmationDialogController";
import { useResetGatewayBudget } from "@/src/features/ai-gateway/hooks/useResetGatewayBudget";
import type { RouterInputs } from "@/src/utils/api";

type ResetBudgetScope = RouterInputs["aiGateway"]["resetSpendLimit"]["scope"];

export type GatewayResetBudgetTarget = {
  scope: ResetBudgetScope;
  subjectId: string;
  name: string;
};

type GatewayResetBudgetDialogControllerProps = {
  organizationId: string;
  children: (control: {
    openDialog: (target: GatewayResetBudgetTarget) => void;
  }) => ReactNode;
};

const titles: Record<ResetBudgetScope, string> = {
  API_KEY: "Reset key budget?",
  USER: "Reset user budget?",
};

/** Confirms and resets the current period's spend for one gateway key or user budget. */
export function GatewayResetBudgetDialogController({
  organizationId,
  children,
}: GatewayResetBudgetDialogControllerProps) {
  const { resetBudget, mutation } = useResetGatewayBudget(organizationId);

  const handleAfterDismiss = () => {
    mutation.reset();
  };

  const handleConfirm = async (target: GatewayResetBudgetTarget) => {
    await resetBudget({
      scope: target.scope,
      subjectId: target.subjectId,
    });
  };

  return (
    <ConfirmationDialogController<GatewayResetBudgetTarget>
      title={getResetTitle}
      text={getResetDescription}
      confirmLabel="Reset budget"
      variant="default"
      loading={mutation.isPending}
      error={mutation.error?.message}
      onAfterDismiss={handleAfterDismiss}
      onConfirm={handleConfirm}
    >
      {children}
    </ConfirmationDialogController>
  );
}

function getResetTitle(target: GatewayResetBudgetTarget) {
  return titles[target.scope];
}

function getResetDescription(target: GatewayResetBudgetTarget) {
  if (target.scope === "USER") {
    return `This resets current-period spend for ${target.name} to $0 across all of their gateway keys. The budget limit stays unchanged and takes effect immediately.`;
  }
  return `This resets current-period spend for ${target.name} to $0. The budget limit stays unchanged and takes effect immediately.`;
}
