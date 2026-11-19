import { type ComponentProps, type ReactNode, useState } from "react";
import { keepPreviousData } from "@tanstack/react-query";

import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { GatewayAddBudgetDialog } from "@/src/features/ai-gateway/components/GatewayBudgetsPage/components/GatewayBudgetsHeaderActions/components/GatewayAddBudgetDialogController/components/GatewayAddBudgetDialog/GatewayAddBudgetDialog";
import {
  GATEWAY_SPEND_TABS,
  type GatewaySpendTab,
} from "@/src/features/ai-gateway/components/GatewayBudgetsPage/constants/gatewaySpendTabs";
import { useAddGatewayBudgets } from "@/src/features/ai-gateway/components/GatewayBudgetsPage/hooks/useAddGatewayBudgets";
import { useGatewaySettingsAccess } from "@/src/features/ai-gateway/hooks/useGatewaySettingsAccess";
import { api, type RouterOutputs } from "@/src/utils/api";

const TARGET_OPTION_LIMIT = 50;
const ALREADY_BUDGETED = {
  disabled: true,
  secondaryLabel: "Has a budget",
} as const;

type GatewayAddBudgetDialogProps = ComponentProps<
  typeof GatewayAddBudgetDialog
>;

type GatewayBudgetRow =
  RouterOutputs["aiGateway"]["listBudgets"]["rows"][number];

type GatewayAddedBudgets = {
  targetType: GatewaySpendTab;
  /** Rows selected in the table; those without a budget of their own start selected. */
  selectedRows: GatewayBudgetRow[];
};

type GatewayAddBudgetDialogControllerProps = {
  organizationId: string;
  children: (control: {
    openDialog: (budgets: GatewayAddedBudgets) => void;
  }) => ReactNode;
};

/** Adds a budget to keys or users without one; members only to their own keys. */
export function GatewayAddBudgetDialogController({
  organizationId,
  children,
}: GatewayAddBudgetDialogControllerProps) {
  const { spendBudgetUnavailableReason } =
    useGatewaySettingsAccess(organizationId);
  const { addBudgets, mutation } = useAddGatewayBudgets(organizationId);

  return (
    <DialogController<GatewayAddedBudgets>
      onBeforeClose={() => !mutation.isPending}
      onDismiss={() => mutation.reset()}
      renderDialog={({ state, closeDialog }) => (
        <ConnectedGatewayAddBudgetDialog
          organizationId={organizationId}
          targetType={state.targetType}
          initialTargets={state.selectedRows
            .map((row) => toTargetOption(state.targetType, row))
            .filter((option) => !option.disabled)}
          unavailableReason={spendBudgetUnavailableReason}
          errorMessage={
            mutation.isError ? (mutation.error?.message ?? "Try again.") : null
          }
          isSubmitting={mutation.isPending}
          onSubmit={async ({ targetIds, spendLimit }) => {
            const added = await addBudgets({
              tab: state.targetType,
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

  const candidates = api.aiGateway.listBudgets.useQuery(
    {
      orgId: organizationId,
      scope: GATEWAY_SPEND_TABS[targetType].scope,
      searchQuery: search,
      status: "all",
      page: 0,
      limit: TARGET_OPTION_LIMIT,
    },
    { placeholderData: keepPreviousData },
  );
  const options = (candidates.data?.rows ?? []).map((row) =>
    toTargetOption(targetType, row),
  );

  return (
    <GatewayAddBudgetDialog
      {...props}
      targetPicker={{
        options,
        search,
        onSearchChange: setSearch,
        isLoading: candidates.isLoading,
      }}
    />
  );
}

/** Keys show their user; users show their email. Those with a budget are disabled. */
function toTargetOption(
  targetType: GatewaySpendTab,
  row: GatewayBudgetRow,
): GatewayAddBudgetDialogProps["targetPicker"]["options"][number] {
  // Rows on the default have no budget of their own, so one can be added.
  const budgeted =
    row.spendLimit !== null && !row.isDefault ? ALREADY_BUDGETED : undefined;
  if (targetType === "apiKeys") {
    return {
      value: row.subjectId,
      label: row.name,
      secondaryLabel: row.user?.name ?? undefined,
      ...budgeted,
    };
  }
  return {
    value: row.subjectId,
    label:
      row.user?.name && row.user.email
        ? `${row.user.name} (${row.user.email})`
        : row.name,
    ...budgeted,
  };
}
