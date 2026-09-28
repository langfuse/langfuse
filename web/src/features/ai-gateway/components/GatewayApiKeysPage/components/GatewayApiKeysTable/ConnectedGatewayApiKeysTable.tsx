import { useState } from "react";
import { Alert } from "@/src/components/design-system/Alert/Alert";
import { Button } from "@/src/components/ui/button";
import { CreateGatewayApiKeyDialogController } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/components/CreateGatewayApiKeyDialogController/CreateGatewayApiKeyDialogController";
import { ConfirmationDialogController } from "@/src/components/design-system/ConfirmationDialogController/ConfirmationDialogController";
import { api } from "@/src/utils/api";
import { GatewayApiKeysTable } from "./GatewayApiKeysTable";

export function ConnectedGatewayApiKeysTable({
  organizationId,
}: {
  organizationId: string;
}) {
  const apiKeysQuery = api.aiGateway.listApiKeys.useInfiniteQuery(
    { orgId: organizationId, limit: 50 },
    { getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined },
  );
  const [pageIndex, setPageIndex] = useState(0);
  const utils = api.useUtils();
  const revoke = api.aiGateway.revokeApiKey.useMutation();

  if (apiKeysQuery.isError) {
    return (
      <div className="flex flex-col gap-4">
        <Alert variant="destructive">
          <Alert.Title>Gateway API keys could not be loaded</Alert.Title>
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

  const pages = apiKeysQuery.data?.pages ?? [];
  const currentPageIndex = Math.min(pageIndex, Math.max(0, pages.length - 1));

  return (
    <ConfirmationDialogController<string>
      title="Revoke gateway API key"
      text="Requests using this key will immediately be rejected. This action cannot be undone."
      confirmLabel="Revoke key"
      variant="destructive"
      loading={revoke.isPending}
      error={revoke.error?.message}
      onAfterDismiss={revoke.reset}
      onConfirm={async (apiKeyId) => {
        await revoke.mutateAsync({ orgId: organizationId, id: apiKeyId });
        await utils.aiGateway.listApiKeys.invalidate({ orgId: organizationId });
      }}
    >
      {({ openDialog: openRevokeDialog }) => (
        <CreateGatewayApiKeyDialogController organizationId={organizationId}>
          {({ openDialog }) => {
            return (
              <GatewayApiKeysTable
                data={
                  apiKeysQuery.isPending
                    ? { status: "loading" }
                    : {
                        status: "success",
                        data: pages[currentPageIndex]?.data ?? [],
                      }
                }
                pagination={{
                  mode: "cursor",
                  state: { pageIndex: currentPageIndex, pageSize: 50 },
                  pageSizeOptions: [50],
                  hasNextPage:
                    currentPageIndex < pages.length - 1 ||
                    Boolean(apiKeysQuery.hasNextPage),
                  isLoadingNextPage: apiKeysQuery.isFetchingNextPage,
                  onChange: (state) => {
                    if (state.pageIndex < pages.length) {
                      setPageIndex(state.pageIndex);
                      return;
                    }
                    if (!apiKeysQuery.hasNextPage) return;
                    apiKeysQuery.fetchNextPage().then((result) => {
                      if (result.data?.pages[state.pageIndex]) {
                        setPageIndex(state.pageIndex);
                      }
                    });
                  },
                }}
                createAction={openDialog}
                onRevoke={openRevokeDialog}
              />
            );
          }}
        </CreateGatewayApiKeyDialogController>
      )}
    </ConfirmationDialogController>
  );
}
