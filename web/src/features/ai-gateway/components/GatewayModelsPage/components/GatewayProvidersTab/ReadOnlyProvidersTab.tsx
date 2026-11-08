import { Button as TextButton } from "@/src/components/design-system/Button/Button";
import { GATEWAY_MODELS_DOCS_URL } from "@/src/features/ai-gateway/constants/gatewayDocsUrls";
import { GatewayLoadError } from "@/src/features/ai-gateway/components/GatewayLoadError/GatewayLoadError";
import { getGatewayModelCounts } from "@/src/features/ai-gateway/components/GatewayModelsPage/fns/getGatewayModelCounts";
import { GatewayNoProvidersEmptyState } from "@/src/features/ai-gateway/components/GatewayModelsPage/components/GatewayNoProvidersEmptyState/GatewayNoProvidersEmptyState";
import { buildGatewayModelsUrl } from "@/src/features/ai-gateway/fns/gatewayUrls/buildGatewayModelsUrl";
import { api } from "@/src/utils/api";
import { GatewayProviderCard } from "./components/GatewayProviderCard/GatewayProviderCard";
import { GatewayProviderCardGrid } from "./components/GatewayProviderCardGrid";
import { ProvidersTabSkeleton } from "./components/ProvidersTabSkeleton";

export type ReadOnlyProvidersTabProps = {
  organizationId: string;
};

/** Enabled providers without credentials or controls, for members who cannot manage the gateway. */
export function ReadOnlyProvidersTab({
  organizationId,
}: ReadOnlyProvidersTabProps) {
  const connectionsQuery = api.aiGateway.listModelConnections.useQuery({
    orgId: organizationId,
  });
  const modelsQuery = api.aiGateway.refreshModels.useQuery(
    { orgId: organizationId },
    { enabled: connectionsQuery.isSuccess },
  );

  if (connectionsQuery.isPending) return <ProvidersTabSkeleton />;
  if (connectionsQuery.isError) {
    return (
      <GatewayLoadError
        kind="providers"
        onRetry={() => connectionsQuery.refetch()}
      />
    );
  }

  const connections = connectionsQuery.data;
  if (connections.length === 0) return <GatewayNoProvidersEmptyState />;

  const modelCounts = getGatewayModelCounts(
    modelsQuery.data ?? [],
    connections,
  );

  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted-foreground text-sm">
        The providers your organization routes gateway requests through.{" "}
        <TextButton
          variant="text"
          text="About gateway models"
          href={GATEWAY_MODELS_DOCS_URL}
        />
      </p>
      <GatewayProviderCardGrid>
        {connections.map((connection) => (
          <GatewayProviderCard
            key={connection.id}
            name={connection.name}
            provider={connection.provider}
            modelCount={
              modelsQuery.isPending ? "loading" : modelCounts[connection.id]
            }
            modelsHref={buildGatewayModelsUrl(organizationId, connection.id)}
          />
        ))}
      </GatewayProviderCardGrid>
    </div>
  );
}
