import type { ReactNode } from "react";

import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { GatewayEditBudgetDialog } from "@/src/features/ai-gateway/components/GatewayBudgetsPage/components/GatewayEditBudgetDialog/GatewayEditBudgetDialog";
import type { GatewaySpendBudgetInterval } from "@/src/features/ai-gateway/constants/gatewaySpendBudgetIntervalOptions";
import { useGatewaySettingsAccess } from "@/src/features/ai-gateway/hooks/useGatewaySettingsAccess";
import {
  api,
  reportNonTrpcError,
  reportTrpcErrorWithoutToast,
} from "@/src/utils/api";

type GatewaySpendLimit = {
  interval: GatewaySpendBudgetInterval;
  limitUsd: number;
};

type GatewayEditedBudget = {
  subject: "key" | "user";
  /** The key or user id. */
  subjectId: string;
  subjectName: string;
  spendLimit: GatewaySpendLimit;
};

type GatewayEditBudgetDialogControllerProps = {
  organizationId: string;
  children: (control: {
    openDialog: (budget: GatewayEditedBudget) => void;
  }) => ReactNode;
};

/** Updates or deletes a key or user budget; the server checks who may. */
export function GatewayEditBudgetDialogController({
  organizationId,
  children,
}: GatewayEditBudgetDialogControllerProps) {
  const { isRecording } = useGatewaySettingsAccess(organizationId);
  const utils = api.useUtils();
  const onError = (error: unknown) =>
    reportTrpcErrorWithoutToast(error, "ai-gateway-budgets");
  const setKeyBudget = api.aiGateway.setApiKeySpendLimit.useMutation({
    onError,
  });
  const updateUserBudget = api.aiGateway.updateUserSpendLimit.useMutation({
    onError,
  });
  const removeUserBudget = api.aiGateway.deleteUserSpendLimit.useMutation({
    onError,
  });
  const mutations = [setKeyBudget, updateUserBudget, removeUserBudget];
  const isPending = mutations.some((mutation) => mutation.isPending);
  const failed = mutations.find((mutation) => mutation.isError);

  const save = async (
    budget: GatewayEditedBudget,
    spendLimit: GatewaySpendLimit | null,
    closeDialog: () => void,
  ) => {
    const orgId = organizationId;
    try {
      if (budget.subject === "key") {
        await setKeyBudget.mutateAsync({
          orgId,
          apiKeyId: budget.subjectId,
          spendLimit,
        });
      } else if (spendLimit) {
        await updateUserBudget.mutateAsync({
          orgId,
          userId: budget.subjectId,
          spendLimit,
        });
      } else {
        await removeUserBudget.mutateAsync({ orgId, userId: budget.subjectId });
      }
      closeDialog();
      mutations.forEach((mutation) => mutation.reset());
    } catch (error) {
      reportNonTrpcError(error, "ai-gateway-budgets");
    } finally {
      // A conflict means the cached budget is stale; reopening must load the current one.
      await Promise.all([
        utils.aiGateway.listBudgets.invalidate({ orgId }),
        utils.aiGateway.listApiKeys.invalidate({ orgId }),
        utils.aiGateway.getApiKeysSpend.invalidate({ orgId }),
        utils.aiGateway.getUsersSpend.invalidate({ orgId }),
      ]);
    }
  };

  return (
    <DialogController<GatewayEditedBudget>
      onBeforeClose={() => !isPending}
      onDismiss={() => mutations.forEach((mutation) => mutation.reset())}
      renderDialog={({ state, closeDialog }) => (
        <GatewayEditBudgetDialog
          subject={state.subject}
          subjectName={state.subjectName}
          spendLimit={state.spendLimit}
          unavailableReason={
            isRecording === false
              ? "Spend budgets need recorded gateway requests. Switch the gateway ingestion to usage to change one."
              : undefined
          }
          errorMessage={failed ? (failed.error?.message ?? "Try again.") : null}
          isSubmitting={isPending}
          onSubmit={(spendLimit) => save(state, spendLimit, closeDialog)}
          onRemove={() => save(state, null, closeDialog)}
        />
      )}
    >
      {({ openDialog }) => children({ openDialog })}
    </DialogController>
  );
}
