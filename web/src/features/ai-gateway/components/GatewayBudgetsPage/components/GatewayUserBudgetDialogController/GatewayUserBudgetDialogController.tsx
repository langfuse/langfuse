import type { ReactNode } from "react";

import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { GatewayUserBudgetDialog } from "@/src/features/ai-gateway/components/GatewayBudgetsPage/components/GatewayUserBudgetDialog/GatewayUserBudgetDialog";
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

type BudgetedUser = {
  id: string;
  name: string;
  spendLimit: GatewaySpendLimit | null;
};

type GatewayUserBudgetDialogControllerProps = {
  organizationId: string;
  children: (control: {
    openDialog: (user: BudgetedUser) => void;
  }) => ReactNode;
};

/** Creates, updates or deletes a user's budget; only gateway managers may. */
export function GatewayUserBudgetDialogController({
  organizationId,
  children,
}: GatewayUserBudgetDialogControllerProps) {
  const { isRecording } = useGatewaySettingsAccess(organizationId);
  const utils = api.useUtils();
  const onError = (error: unknown) =>
    reportTrpcErrorWithoutToast(error, "ai-gateway-budgets");
  const create = api.aiGateway.createUserSpendLimit.useMutation({ onError });
  const update = api.aiGateway.updateUserSpendLimit.useMutation({ onError });
  const remove = api.aiGateway.deleteUserSpendLimit.useMutation({ onError });
  const mutations = [create, update, remove];
  const isPending = mutations.some((mutation) => mutation.isPending);
  const failed = mutations.find((mutation) => mutation.isError);

  const run = async (write: () => Promise<void>, closeDialog: () => void) => {
    try {
      await write();
      closeDialog();
      mutations.forEach((mutation) => mutation.reset());
    } catch (error) {
      reportNonTrpcError(error, "ai-gateway-budgets");
    } finally {
      // A conflict means the cached budget is stale; reopening must load the current one.
      await utils.aiGateway.getUsersSpend.invalidate({ orgId: organizationId });
    }
  };

  return (
    <DialogController<BudgetedUser>
      onBeforeClose={() => !isPending}
      onDismiss={() => mutations.forEach((mutation) => mutation.reset())}
      renderDialog={({ state, closeDialog }) => (
        <GatewayUserBudgetDialog
          userName={state.name}
          spendLimit={state.spendLimit}
          unavailableReason={
            isRecording === false
              ? "Spend budgets need recorded gateway requests. Switch the gateway ingestion to usage to set one."
              : undefined
          }
          errorMessage={failed ? (failed.error?.message ?? "Try again.") : null}
          isSubmitting={isPending}
          onSubmit={(spendLimit) =>
            run(async () => {
              const input = {
                orgId: organizationId,
                userId: state.id,
                spendLimit,
              };
              await (state.spendLimit
                ? update.mutateAsync(input)
                : create.mutateAsync(input));
            }, closeDialog)
          }
          onRemove={() =>
            run(async () => {
              await remove.mutateAsync({
                orgId: organizationId,
                userId: state.id,
              });
            }, closeDialog)
          }
        />
      )}
    >
      {({ openDialog }) => children({ openDialog })}
    </DialogController>
  );
}
