import { Button as TextButton } from "@/src/components/design-system/Button/Button";
import { GATEWAY_MODELS_DOCS_URL } from "@/src/features/ai-gateway/constants/gatewayDocsUrls";
import { GatewayLoadError } from "@/src/features/ai-gateway/components/GatewayLoadError/GatewayLoadError";
import { getGatewayModelCounts } from "@/src/features/ai-gateway/components/GatewayModelsPage/fns/getGatewayModelCounts";
import { GatewayNoProvidersReadOnlyEmptyState } from "@/src/features/ai-gateway/components/GatewayModelsPage/components/GatewayNoProvidersEmptyState/GatewayNoProvidersReadOnlyEmptyState";
import { buildGatewayModelsUrl } from "@/src/features/ai-gateway/fns/gatewayUrls/buildGatewayModelsUrl";
import { useGatewayModelCatalog } from "@/src/features/ai-gateway/hooks/useGatewayModelCatalog";
import { useGatewayModelConnections } from "@/src/features/ai-gateway/hooks/useGatewayModelConnections";
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
  const { connections, isError, refetch } =
    useGatewayModelConnections(organizationId);
  const catalog = useGatewayModelCatalog(organizationId, {
    enabled: connections !== undefined,
  });

  if (isError) return <GatewayLoadError kind="providers" onRetry={refetch} />;
  if (!connections) return <ProvidersTabSkeleton />;

  if (connections.length === 0) return <GatewayNoProvidersReadOnlyEmptyState />;

  const modelCounts = getGatewayModelCounts(catalog.results ?? [], connections);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted-foreground text-sm">
        The connections your organization routes gateway requests through.{" "}
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
              catalog.isPending ? "loading" : modelCounts[connection.id]
            }
            modelsHref={buildGatewayModelsUrl(organizationId, connection.id)}
          />
        ))}
      </GatewayProviderCardGrid>
    </div>
  );
}
