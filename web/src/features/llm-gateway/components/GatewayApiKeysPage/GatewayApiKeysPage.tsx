import { Plus } from "lucide-react";

import Header from "@/src/components/layouts/header";
import { Alert } from "@/src/components/design-system/Alert/Alert";
import { Button } from "@/src/components/ui/button";
import { Skeleton } from "@/src/components/ui/skeleton";
import { CreateGatewayApiKeyDialogController } from "@/src/features/llm-gateway/components/GatewayApiKeysPage/components/CreateGatewayApiKeyDialogController/CreateGatewayApiKeyDialogController";
import { GatewayApiKeysView } from "@/src/features/llm-gateway/components/GatewayApiKeysPage/components/GatewayApiKeysView/GatewayApiKeysView";
import { RevokeGatewayApiKeyDialog } from "@/src/features/llm-gateway/components/GatewayApiKeysPage/components/RevokeGatewayApiKeyDialog";
import { api } from "@/src/utils/api";

export function GatewayApiKeysPage({
  organizationId,
}: {
  organizationId: string;
}) {
  const apiKeysQuery = api.llmGateway.listApiKeys.useInfiniteQuery(
    { orgId: organizationId, limit: 50 },
    { getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined },
  );

  if (apiKeysQuery.isPending) {
    return <ApiKeysSkeleton />;
  }

  if (apiKeysQuery.isError) {
    return (
      <div className="flex flex-col gap-4">
        <Header title="Gateway API keys" />
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

  return (
    <GatewayApiKeysView
      apiKeys={apiKeysQuery.data?.pages.flatMap((page) => page.data) ?? []}
      hasMore={Boolean(apiKeysQuery.hasNextPage)}
      isLoadingMore={apiKeysQuery.isFetchingNextPage}
      onLoadMore={() => apiKeysQuery.fetchNextPage()}
      createAction={
        <CreateGatewayApiKeyDialogController organizationId={organizationId}>
          {({ Trigger }) => (
            <Trigger asChild>
              <Button>
                <Plus className="mr-1.5 size-4" />
                Create gateway key
              </Button>
            </Trigger>
          )}
        </CreateGatewayApiKeyDialogController>
      }
      renderRevokeAction={(apiKeyId) => (
        <RevokeGatewayApiKeyDialog
          organizationId={organizationId}
          apiKeyId={apiKeyId}
        />
      )}
    />
  );
}

function ApiKeysSkeleton() {
  return (
    <div className="flex flex-col gap-4" data-testid="gateway-api-keys-loading">
      <Skeleton className="h-7 w-48" />
      <Skeleton className="h-48 w-full" />
    </div>
  );
}
