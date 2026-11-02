import { useState } from "react";
import { keepPreviousData } from "@tanstack/react-query";

import { Alert } from "@/src/components/design-system/Alert/Alert";
import { Button } from "@/src/components/ui/button";
import { CreateGatewayApiKeyDialogController } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/components/CreateGatewayApiKeyDialogController/CreateGatewayApiKeyDialogController";
import { TeamInviteDialogController } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/components/TeamInviteDialogController/TeamInviteDialogController";
import { ConfirmationDialogController } from "@/src/components/design-system/ConfirmationDialogController/ConfirmationDialogController";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { usePaginationState } from "@/src/hooks/usePaginationState";
import { api } from "@/src/utils/api";
import { GatewayApiKeysTable } from "./GatewayApiKeysTable";

export function ConnectedGatewayApiKeysTable({
  organizationId,
  canInvite,
}: {
  organizationId: string;
  /** Owners and admins only: inviting needs gateway management and member management. */
  canInvite: boolean;
}) {
  const [paginationState, setPaginationState] = usePaginationState(0, 10, {
    page: "pageIndex",
    limit: "pageSize",
  });
  const [searchQuery, setSearchQuery] = useState("");
  const apiKeysQuery = api.aiGateway.listApiKeys.useQuery(
    {
      orgId: organizationId,
      searchQuery,
      page: paginationState.pageIndex,
      limit: paginationState.pageSize,
    },
    { placeholderData: keepPreviousData },
  );
  const utils = api.useUtils();
  const capture = usePostHogClientCapture();
  const revoke = api.aiGateway.revokeApiKey.useMutation();

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
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
        await utils.aiGateway.listApiKeys.invalidate({ orgId: organizationId });
      }}
    >
      {({ openDialog: openRevokeDialog }) => (
        <TeamInviteDialogController organizationId={organizationId}>
          {({ openDialog: openInviteDialog }) => (
            <CreateGatewayApiKeyDialogController
              organizationId={organizationId}
            >
              {({ openDialog }) => {
                return (
                  <GatewayApiKeysTable
                    data={
                      apiKeysQuery.isPending
                        ? { status: "loading" }
                        : {
                            status: "success",
                            data: apiKeysQuery.data.data,
                          }
                    }
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
                    createAction={openDialog}
                    inviteAction={canInvite ? openInviteDialog : undefined}
                    onRevoke={openRevokeDialog}
                  />
                );
              }}
            </CreateGatewayApiKeyDialogController>
          )}
        </TeamInviteDialogController>
      )}
    </ConfirmationDialogController>
  );
}
