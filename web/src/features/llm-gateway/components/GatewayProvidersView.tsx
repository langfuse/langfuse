import type { ReactNode } from "react";
import { Route } from "lucide-react";
import { SiAnthropic, SiOpenai } from "react-icons/si";

import Header from "@/src/components/layouts/header";
import { Badge } from "@/src/components/ui/badge";
import { Card } from "@/src/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/src/components/ui/table";

type GatewayProvider = "OPENAI" | "ANTHROPIC" | "OPENROUTER";
type Connection = {
  id: string;
  name: string;
  provider: GatewayProvider;
  displaySecret: string;
  status: "ENABLED" | "DISABLED" | "ERROR";
};

const providerLabels: Record<GatewayProvider, string> = {
  OPENAI: "OpenAI",
  ANTHROPIC: "Anthropic",
  OPENROUTER: "OpenRouter",
};

export function GatewayProvidersView({
  connections,
  modelCounts,
  createAction,
  renderPriorityActions,
  renderCredentialActions,
}: {
  connections: Connection[];
  modelCounts: Record<string, number>;
  createAction: ReactNode;
  renderPriorityActions: (connection: Connection, index: number) => ReactNode;
  renderCredentialActions: (connection: Connection, index: number) => ReactNode;
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
              <TableHead className="w-20">Priority</TableHead>
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
                <TableRow key={connection.id} className="ph-no-capture">
                  <TableCell density="comfortable" className="font-mono">
                    {index + 1}
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
                      {renderPriorityActions(connection, index)}
                      {renderCredentialActions(connection, index)}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
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
