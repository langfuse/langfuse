import { type ComponentProps, type ReactNode, useState } from "react";
import { keepPreviousData } from "@tanstack/react-query";

import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { GatewayAddBudgetDialog } from "@/src/features/ai-gateway/components/GatewayBudgetsPage/components/GatewayBudgetsHeaderActions/components/GatewayAddBudgetDialogController/components/GatewayAddBudgetDialog/GatewayAddBudgetDialog";
import type { GatewaySpendTab } from "@/src/features/ai-gateway/components/GatewayBudgetsPage/constants/gatewaySpendTabs";
import { useAddGatewayBudgets } from "@/src/features/ai-gateway/components/GatewayBudgetsPage/hooks/useAddGatewayBudgets";
import { MAX_MEMBER_SEARCH_LENGTH } from "@/src/features/ai-gateway/constants/gatewayTeamInvites";
import { useGatewaySettingsAccess } from "@/src/features/ai-gateway/hooks/useGatewaySettingsAccess";
import { api } from "@/src/utils/api";

const TARGET_OPTION_LIMIT = 50;
const ALREADY_BUDGETED = {
  disabled: true,
  secondaryLabel: "Has a budget",
} as const;

type GatewayAddBudgetDialogProps = ComponentProps<
  typeof GatewayAddBudgetDialog
>;

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
  const { spendBudgetUnavailableReason } =
    useGatewaySettingsAccess(organizationId);
  const { addBudgets, mutation } = useAddGatewayBudgets(organizationId);

  return (
    <DialogController<GatewaySpendTab>
      onBeforeClose={() => !mutation.isPending}
      onDismiss={() => mutation.reset()}
      renderDialog={({ state, closeDialog }) => (
        <ConnectedGatewayAddBudgetDialog
          organizationId={organizationId}
          targetType={state}
          unavailableReason={spendBudgetUnavailableReason}
          errorMessage={
            mutation.isError ? (mutation.error?.message ?? "Try again.") : null
          }
          isSubmitting={mutation.isPending}
          onSubmit={async ({ targetIds, spendLimit }) => {
            const added = await addBudgets({
              tab: state,
              subjectIds: targetIds,
              spendLimit,
            });
            if (!added) return;
            closeDialog();
            mutation.reset();
          }}
        />
      )}
    >
      {({ openDialog }) => children({ openDialog })}
    </DialogController>
  );
}

/** Searches the keys or users the budget can be added to while the dialog is open. */
function ConnectedGatewayAddBudgetDialog({
  organizationId,
  ...props
}: Omit<GatewayAddBudgetDialogProps, "targetPicker"> & {
  organizationId: string;
}) {
  const { targetType } = props;
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

  const options: GatewayAddBudgetDialogProps["targetPicker"]["options"] =
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

  return (
    <GatewayAddBudgetDialog
      {...props}
      targetPicker={{
        options,
        search,
        onSearchChange: setSearch,
        isLoading,
      }}
    />
  );
}
