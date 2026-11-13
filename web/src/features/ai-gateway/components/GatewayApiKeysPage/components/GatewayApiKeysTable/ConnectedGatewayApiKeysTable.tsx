import { type ReactNode, useState } from "react";
import type { OrderByState } from "@langfuse/shared";

import { Alert } from "@/src/components/design-system/Alert/Alert";
import { Button } from "@/src/components/ui/button";
import { ConfirmationDialogController } from "@/src/components/design-system/ConfirmationDialogController/ConfirmationDialogController";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { usePaginationState } from "@/src/hooks/usePaginationState";
import { useOrderByState } from "@/src/features/orderBy/hooks/useOrderByState";
import { useGatewayApiKeysTableData } from "@/src/features/ai-gateway/hooks/useGatewayApiKeysTableData";
import { api } from "@/src/utils/api";
import { EditGatewayApiKeyDialogController } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/components/EditGatewayApiKeyDialogController/EditGatewayApiKeyDialogController";
import { GatewayApiKeysTable } from "./GatewayApiKeysTable";

export function ConnectedGatewayApiKeysTable({
  organizationId,
  description,
  emptyState,
}: {
  organizationId: string;
  /** Shown above the table; the no-keys placeholder explains keys itself. */
  description: ReactNode;
  /** Replaces the whole table, search included, while there are no keys. */
  emptyState?: ReactNode;
}) {
  const [paginationState, setPaginationState] = usePaginationState(0, 10, {
    page: "pageIndex",
    limit: "pageSize",
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [orderBy, setOrderBy] = useOrderByState();
  const { apiKeysQuery, rows, lastUsed } = useGatewayApiKeysTableData({
    organizationId,
    searchQuery,
    orderBy,
    pageIndex: paginationState.pageIndex,
    pageSize: paginationState.pageSize,
  });
  const utils = api.useUtils();
  const capture = usePostHogClientCapture();
  const revoke = api.aiGateway.revokeApiKey.useMutation();

  const hasNoKeys =
    searchQuery.trim().length === 0 && apiKeysQuery.data?.totalCount === 0;

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setPaginationState({ ...paginationState, pageIndex: 0 });
  };

  const handleOrderByChange = (value: OrderByState) => {
    setOrderBy(value);
    setPaginationState({ ...paginationState, pageIndex: 0 });
  };

  if (apiKeysQuery.isError) {
    return (
      <div className="flex flex-col gap-4">
        <Alert variant="destructive">
          <Alert.Title>Gateway keys could not be loaded</Alert.Title>
          <Alert.Description>
            Retry to manage keys for this organization.
          </Alert.Description>
        </Alert>
        <Button
          className="w-fit"
          variant="secondary"
          onClick={() => apiKeysQuery.refetch()}
        >
          Retry
        </Button>
      </div>
    );
  }

  if (hasNoKeys && emptyState !== undefined) return emptyState;

  return (
    <ConfirmationDialogController<string>
      title="Revoke gateway key"
      text="Requests using this key will immediately be rejected. This action cannot be undone."
      confirmLabel="Revoke key"
      variant="destructive"
      loading={revoke.isPending}
      error={revoke.error?.message}
      onAfterDismiss={revoke.reset}
      onConfirm={async (apiKeyId) => {
        await revoke.mutateAsync({ orgId: organizationId, id: apiKeyId });
        capture("ai_gateway:api_key_revoked", { orgId: organizationId });
        const remainingCount = (apiKeysQuery.data?.totalCount ?? 1) - 1;
        const lastPageIndex = Math.max(
          0,
          Math.ceil(remainingCount / paginationState.pageSize) - 1,
        );
        if (paginationState.pageIndex > lastPageIndex) {
          setPaginationState({ ...paginationState, pageIndex: lastPageIndex });
        }
        await Promise.all([
          utils.aiGateway.listApiKeys.invalidate({ orgId: organizationId }),
          utils.aiGateway.getAnalyticsLabels.invalidate({
            orgId: organizationId,
          }),
        ]);
      }}
    >
      {({ openDialog: openRevokeDialog }) => (
        <EditGatewayApiKeyDialogController organizationId={organizationId}>
          {({ openDialog: openEditDialog }) => (
            <div className="flex h-full min-h-0 flex-col gap-4">
              {hasNoKeys ? null : description}
              <div className="flex min-h-0 flex-1 flex-col">
                <GatewayApiKeysTable
                  data={
                    rows === undefined
                      ? { status: "loading" }
                      : { status: "success", data: rows }
                  }
                  lastUsed={lastUsed}
                  orderBy={orderBy}
                  setOrderBy={handleOrderByChange}
                  pagination={{
                    mode: "offset",
                    totalCount: apiKeysQuery.data?.totalCount ?? null,
                    state: paginationState,
                    onChange: setPaginationState,
                  }}
                  search={{
                    value: searchQuery,
                    onChange: handleSearchChange,
                  }}
                  onEdit={openEditDialog}
                  onRevoke={openRevokeDialog}
                />
              </div>
            </div>
          )}
        </EditGatewayApiKeyDialogController>
      )}
    </ConfirmationDialogController>
  );
}
