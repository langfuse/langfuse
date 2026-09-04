import type { ReactNode } from "react";
import { GripVertical, Route } from "lucide-react";
import { SiAnthropic, SiOpenai } from "react-icons/si";

import Header from "@/src/components/layouts/header";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Card } from "@/src/components/ui/card";
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

type Connection = {
  id: string;
  name: string;
  provider: GatewayProvider;
  displaySecret: string;
  status: "ENABLED" | "DISABLED" | "ERROR";
};

export function GatewayProvidersView({
  connections,
  modelCounts,
  createAction,
  renderPriorityActions,
  renderCredentialActions,
  hasMore,
  isLoadingMore,
  onLoadMore,
  canReorder,
  onReorder,
}: {
  connections: Connection[];
  modelCounts: Record<string, number>;
  createAction: ReactNode;
  renderPriorityActions: (connection: Connection, index: number) => ReactNode;
  renderCredentialActions: (connection: Connection, index: number) => ReactNode;
  hasMore: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => unknown;
  canReorder: boolean;
  onReorder: (sourceId: string, targetId: string) => unknown;
}) {
  return (
    <div className="flex flex-col gap-4">
      <Header title="Provider credentials" actionButtons={createAction} />
      <p className="text-muted-foreground text-sm">
        Requests use the first compatible enabled credential in routing priority
        order. Credentials are validated against the provider when they are
        saved.
      </p>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-32">Priority</TableHead>
              <TableHead>Provider</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Credential</TableHead>
              <TableHead className="w-28">Status</TableHead>
              <TableHead className="w-24">Models</TableHead>
              <TableHead className="w-56 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {connections.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  density="comfortable"
                  className="text-muted-foreground text-center"
                >
                  No provider credentials configured.
                </TableCell>
              </TableRow>
            ) : (
              connections.map((connection, index) => (
                <TableRow
                  key={connection.id}
                  className="ph-no-capture group"
                  onDragOver={(event) => {
                    if (canReorder) event.preventDefault();
                  }}
                  onDrop={(event) => {
                    const sourceId =
                      event.dataTransfer.getData("text/provider-id");
                    if (sourceId && sourceId !== connection.id) {
                      onReorder(sourceId, connection.id);
                    }
                  }}
                >
                  <TableCell density="comfortable">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        draggable={canReorder}
                        disabled={!canReorder}
                        aria-label={`Drag ${connection.name} to reorder`}
                        className="text-muted-foreground cursor-grab p-0.5 opacity-50 hover:opacity-100 disabled:cursor-not-allowed"
                        onDragStart={(event) => {
                          event.dataTransfer.setData(
                            "text/provider-id",
                            connection.id,
                          );
                          event.dataTransfer.effectAllowed = "move";
                        }}
                      >
                        <GripVertical className="size-3.5" />
                      </button>
                      <span className="w-4 text-center font-mono">
                        {index + 1}
                      </span>
                      <div className="flex opacity-40 transition-opacity group-hover:opacity-100">
                        {renderPriorityActions(connection, index)}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell density="comfortable">
                    <ProviderName provider={connection.provider} />
                  </TableCell>
                  <TableCell density="comfortable" className="font-bold">
                    {connection.name}
                  </TableCell>
                  <TableCell density="comfortable" className="font-mono">
                    {connection.displaySecret}
                  </TableCell>
                  <TableCell density="comfortable">
                    <ConnectionStatus status={connection.status} />
                  </TableCell>
                  <TableCell density="comfortable">
                    {modelCounts[connection.id] ?? "—"}
                  </TableCell>
                  <TableCell density="comfortable">
                    <div className="flex justify-end gap-1">
                      {renderCredentialActions(connection, index)}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
      {hasMore ? (
        <Button
          className="self-center"
          variant="secondary"
          loading={isLoadingMore}
          disabled={isLoadingMore}
          aria-label="Load more"
          onClick={() => {
            onLoadMore();
          }}
        >
          Load more
        </Button>
      ) : null}
    </div>
  );
}

function ProviderName({ provider }: { provider: GatewayProvider }) {
  const icon =
    provider === "OPENAI" ? (
      <SiOpenai className="size-4" aria-hidden="true" />
    ) : provider === "ANTHROPIC" ? (
      <SiAnthropic className="size-4" aria-hidden="true" />
    ) : (
      <Route className="size-4" aria-hidden="true" />
    );

  return (
    <div className="flex items-center gap-2">
      <span className="bg-muted flex size-7 items-center justify-center rounded-md border">
        {icon}
      </span>
      <span>{providerLabels[provider]}</span>
    </div>
  );
}

function ConnectionStatus({ status }: { status: Connection["status"] }) {
  const variant =
    status === "ENABLED"
      ? "success"
      : status === "ERROR"
        ? "error"
        : "secondary";
  return <Badge variant={variant}>{status.toLowerCase()}</Badge>;
}
