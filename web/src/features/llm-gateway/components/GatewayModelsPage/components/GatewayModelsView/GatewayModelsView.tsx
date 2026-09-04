import { RefreshCw } from "lucide-react";

import Header from "@/src/components/layouts/header";
import { Alert } from "@/src/components/design-system/Alert/Alert";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Card } from "@/src/components/ui/card";
import { Skeleton } from "@/src/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/src/components/ui/table";
import { providerLabels } from "@/src/features/llm-gateway/constants/providerLabels";
import type { GatewayProvider } from "@/src/features/llm-gateway/types/gatewayProvider";

type ModelRow = {
  id: string;
  availableVia: Array<{
    connectionName: string;
    provider: GatewayProvider;
  }>;
  apiFormats: string[];
};

export function GatewayModelsView({
  models,
  failedProviderCount,
  providerCount,
  hasProviders,
  hasSynced,
  isLoading,
  syncError,
  onSync,
  hasMoreProviders,
  isLoadingMoreProviders,
  onLoadMoreProviders,
}: {
  models: ModelRow[];
  failedProviderCount: number;
  providerCount: number;
  hasProviders: boolean;
  hasSynced: boolean;
  isLoading: boolean;
  syncError: boolean;
  onSync: () => void | Promise<void>;
  hasMoreProviders: boolean;
  isLoadingMoreProviders: boolean;
  onLoadMoreProviders: () => unknown;
}) {
  return (
    <div className="flex flex-col gap-4">
      <Header
        title="Gateway models"
        actionButtons={
          <Button variant="secondary" loading={isLoading} onClick={onSync}>
            <RefreshCw className="mr-1.5 size-4" />
            {hasSynced ? "Retry sync" : "Sync models"}
          </Button>
        }
      />
      <p className="text-muted-foreground text-sm">
        Models are discovered live from enabled provider credentials. Discovery
        results are not persisted.
      </p>

      {failedProviderCount > 0 ? (
        <Alert variant="warning">
          <Alert.Title>Some providers could not be reached</Alert.Title>
          <Alert.Description>
            Showing models from successful providers. {failedProviderCount} of{" "}
            {providerCount} credentials failed to sync.
          </Alert.Description>
        </Alert>
      ) : null}

      {syncError ? (
        <Alert variant="destructive">
          <Alert.Title>Model sync failed</Alert.Title>
          <Alert.Description>
            No provider results were returned. Retry the sync.
          </Alert.Description>
        </Alert>
      ) : null}

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Model</TableHead>
              <TableHead>Available via</TableHead>
              <TableHead>API formats</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 4 }).map((_, index) => (
                <TableRow key={index}>
                  <TableCell density="comfortable">
                    <Skeleton className="h-4 w-44" />
                  </TableCell>
                  <TableCell density="comfortable">
                    <Skeleton className="h-5 w-32" />
                  </TableCell>
                  <TableCell density="comfortable">
                    <Skeleton className="h-5 w-40" />
                  </TableCell>
                </TableRow>
              ))
            ) : models.length > 0 ? (
              models.map((model) => (
                <TableRow key={model.id}>
                  <TableCell density="comfortable" className="font-mono">
                    {model.id}
                  </TableCell>
                  <TableCell density="comfortable">
                    <div className="flex flex-wrap gap-1">
                      {model.availableVia.map((connection) => (
                        <Badge
                          key={`${connection.provider}:${connection.connectionName}`}
                          variant="outline-solid"
                        >
                          {connection.connectionName} ·{" "}
                          {providerLabels[connection.provider]}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell density="comfortable">
                    <div className="flex flex-wrap gap-1">
                      {model.apiFormats.map((format) => (
                        <Badge key={format} variant="secondary">
                          {format}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={3}
                  density="comfortable"
                  className="text-muted-foreground text-center"
                >
                  {!hasProviders
                    ? "Add a provider credential before discovering models."
                    : hasSynced
                      ? "No models were returned by the configured providers."
                      : "Sync models to discover what is currently available."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
      {hasMoreProviders ? (
        <Button
          className="self-center"
          variant="secondary"
          loading={isLoadingMoreProviders}
          disabled={isLoadingMoreProviders}
          aria-label="Load more providers"
          onClick={() => {
            onLoadMoreProviders();
          }}
        >
          Load more providers
        </Button>
      ) : null}
    </div>
  );
}
