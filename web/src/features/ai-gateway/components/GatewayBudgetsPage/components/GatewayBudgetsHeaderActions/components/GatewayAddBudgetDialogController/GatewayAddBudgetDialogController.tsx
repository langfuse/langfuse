import { type ComponentProps, type ReactNode, useState } from "react";
import { keepPreviousData } from "@tanstack/react-query";

import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { GatewayAddBudgetDialog } from "@/src/features/ai-gateway/components/GatewayBudgetsPage/components/GatewayBudgetsHeaderActions/components/GatewayAddBudgetDialogController/components/GatewayAddBudgetDialog/GatewayAddBudgetDialog";
import type { GatewaySpendTab } from "@/src/features/ai-gateway/components/GatewayBudgetsPage/constants/gatewaySpendTabs";
import { MAX_MEMBER_SEARCH_LENGTH } from "@/src/features/ai-gateway/constants/gatewayTeamInvites";
import { useGatewaySettingsAccess } from "@/src/features/ai-gateway/hooks/useGatewaySettingsAccess";
import {
  api,
  reportNonTrpcError,
  reportTrpcErrorWithoutToast,
} from "@/src/utils/api";

const TARGET_OPTION_LIMIT = 50;
const ALREADY_BUDGETED = {
  disabled: true,
  secondaryLabel: "Has a budget",
} as const;

type TargetOptions = ComponentProps<
  typeof GatewayAddBudgetDialog
>["targetPicker"]["options"];

type GatewayAddBudgetDialogControllerProps = {
  organizationId: string;
  children: (control: {
    openDialog: (targetType: GatewaySpendTab) => void;
  }) => ReactNode;
};

/** Adds a budget to keys or users without one; only gateway managers may. */
export function GatewayAddBudgetDialogController({
  organizationId,
  children,
}: GatewayAddBudgetDialogControllerProps) {
  const [isPending, setIsPending] = useState(false);

  return (
    <DialogController<GatewaySpendTab>
      onBeforeClose={() => !isPending}
      renderDialog={({ state, closeDialog }) => (
        <ConnectedGatewayAddBudgetDialog
          organizationId={organizationId}
          targetType={state}
          onPendingChange={setIsPending}
          onAdded={closeDialog}
        />
      )}
    >
      {({ openDialog }) => children({ openDialog })}
    </DialogController>
  );
}

function ConnectedGatewayAddBudgetDialog({
  organizationId,
  targetType,
  onPendingChange,
  onAdded,
}: {
  organizationId: string;
  targetType: GatewaySpendTab;
  onPendingChange: (isPending: boolean) => void;
  onAdded: () => void;
}) {
  const { isRecording } = useGatewaySettingsAccess(organizationId);
  const utils = api.useUtils();
  const [search, setSearch] = useState("");

  const apiKeysQuery = api.aiGateway.listApiKeys.useQuery(
    {
      orgId: organizationId,
      searchQuery: search,
      page: 0,
      limit: TARGET_OPTION_LIMIT,
    },
    { enabled: targetType === "apiKeys", placeholderData: keepPreviousData },
  );
  const usersQuery = api.aiGateway.getBudgetUserOptions.useQuery(
    {
      orgId: organizationId,
      search: search.trim().slice(0, MAX_MEMBER_SEARCH_LENGTH),
    },
    { enabled: targetType === "users", placeholderData: keepPreviousData },
  );
  const userIds = usersQuery.data?.map(({ id }) => id) ?? [];
  const userBudgetsQuery = api.aiGateway.getUsersSpend.useQuery(
    { orgId: organizationId, userIds },
    { enabled: targetType === "users" && userIds.length > 0 },
  );
  const budgetedUserIds = new Set(
    userBudgetsQuery.data?.map(({ id }) => id) ?? [],
  );

  const options: TargetOptions =
    targetType === "apiKeys"
      ? (apiKeysQuery.data?.data ?? []).map(({ apiKey, spendLimit }) => ({
          value: apiKey.id,
          label: apiKey.note ?? apiKey.displaySecretKey,
          ...(spendLimit !== null
            ? ALREADY_BUDGETED
            : { secondaryLabel: apiKey.user?.name ?? undefined }),
        }))
      : (usersQuery.data ?? []).map((user) => ({
          value: user.id,
          label: user.name ? `${user.name} (${user.email})` : user.email,
          ...(budgetedUserIds.has(user.id) && ALREADY_BUDGETED),
        }));
  const isLoading =
    targetType === "apiKeys"
      ? apiKeysQuery.isLoading
      : usersQuery.isLoading || userBudgetsQuery.isLoading;

  const mutation = api.aiGateway.createSpendLimits.useMutation({
    onError: (error) =>
      reportTrpcErrorWithoutToast(error, "ai-gateway-budgets"),
  });

  const handleSubmit: ComponentProps<
    typeof GatewayAddBudgetDialog
  >["onSubmit"] = async ({ targetIds, spendLimit }) => {
    onPendingChange(true);
    try {
      await mutation.mutateAsync({
        orgId: organizationId,
        scope: targetType === "apiKeys" ? "API_KEY" : "USER",
        subjectIds: targetIds,
        spendLimit,
      });
      onAdded();
    } catch (error) {
      reportNonTrpcError(error, "ai-gateway-budgets");
    } finally {
      onPendingChange(false);
      await Promise.all([
        utils.aiGateway.listBudgets.invalidate({ orgId: organizationId }),
        utils.aiGateway.listApiKeys.invalidate({ orgId: organizationId }),
        utils.aiGateway.getApiKeysSpend.invalidate({ orgId: organizationId }),
        utils.aiGateway.getUsersSpend.invalidate({ orgId: organizationId }),
        utils.aiGateway.getConfig.invalidate({ orgId: organizationId }),
      ]);
    }
  };

  return (
    <GatewayAddBudgetDialog
      targetType={targetType}
      targetPicker={{
        options,
        search,
        onSearchChange: setSearch,
        isLoading,
      }}
      unavailableReason={
        isRecording === false
          ? "Spend budgets need recorded gateway requests. Switch the gateway ingestion to usage to set one."
          : undefined
      }
      errorMessage={
        mutation.isError ? (mutation.error?.message ?? "Try again.") : null
      }
      isSubmitting={mutation.isPending}
      onSubmit={handleSubmit}
    />
  );
}
