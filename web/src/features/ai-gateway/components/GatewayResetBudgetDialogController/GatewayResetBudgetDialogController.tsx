import type { ReactNode } from "react";

import { ConfirmationDialogController } from "@/src/components/design-system/ConfirmationDialogController/ConfirmationDialogController";
import { useResetGatewayBudget } from "@/src/features/ai-gateway/hooks/useResetGatewayBudget";
import type { AiGatewayEventMap } from "@/src/features/ai-gateway/types/aiGatewayAnalytics";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import type { RouterInputs } from "@/src/utils/api";

type ResetBudgetScope = RouterInputs["aiGateway"]["resetSpendLimit"]["scope"];
type ResetBudgetSurface =
  AiGatewayEventMap["ai_gateway:budget_reset"]["surface"];

export type GatewayResetBudgetTarget = {
  scope: ResetBudgetScope;
  subjectId: string;
  name: string;
  /** True when the subject currently inherits the organization's default budget rather than having its own. */
  isDefault: boolean;
};

type GatewayResetBudgetDialogControllerProps = {
  organizationId: string;
  surface: ResetBudgetSurface;
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
  surface,
  children,
}: GatewayResetBudgetDialogControllerProps) {
  const { resetBudget, mutation } = useResetGatewayBudget(organizationId);
  const capture = usePostHogClientCapture();

  const handleAfterDismiss = () => {
    mutation.reset();
  };

  const handleConfirm = async (target: GatewayResetBudgetTarget) => {
    await resetBudget({
      scope: target.scope,
      subjectId: target.subjectId,
    });
    capture("ai_gateway:budget_reset", {
      orgId: organizationId,
      scope: target.scope,
      surface,
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
    if (target.isDefault) {
      return `Resets ${target.name}'s spend to $0 for this period. This creates a custom budget at the current default limit, so future default changes won't apply to them.`;
    }
    return `Resets ${target.name}'s spend to $0 for this period. Their budget limit stays unchanged.`;
  }
  if (target.isDefault) {
    return `Resets ${target.name}'s spend to $0 for this period. This creates a custom budget at the current default limit, so future default changes won't apply to it.`;
  }
  return `Resets ${target.name}'s spend to $0 for this period. Its budget limit stays unchanged.`;
}
