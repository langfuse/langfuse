import type { ReactNode } from "react";

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

type GatewayApiKey = {
  metadata: unknown;
  apiKey: {
    id: string;
    publicKey: string;
    displaySecretKey: string;
    note: string | null;
    createdAt: Date;
  };
};

export function GatewayApiKeysView({
  apiKeys,
  createAction,
  renderRevokeAction,
}: {
  apiKeys: GatewayApiKey[];
  createAction: ReactNode;
  renderRevokeAction: (apiKeyId: string) => ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4">
      <Header title="Gateway API keys" actionButtons={createAction} />
      <p className="text-muted-foreground text-sm">
        These organization keys authenticate requests to the LLM Gateway only.
      </p>
      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-32">Created</TableHead>
              <TableHead>Key</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Metadata</TableHead>
              <TableHead className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {apiKeys.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  density="comfortable"
                  className="text-muted-foreground text-center"
                >
                  No gateway API keys created.
                </TableCell>
              </TableRow>
            ) : (
              apiKeys.map((association) => {
                const apiKey = association.apiKey;
                const metadata = getMetadataEntries(association.metadata);
                return (
                  <TableRow key={apiKey.id} className="ph-no-capture">
                    <TableCell density="comfortable">
                      {apiKey.createdAt.toLocaleDateString()}
                    </TableCell>
                    <TableCell density="comfortable" className="font-mono">
                      <div>{apiKey.publicKey}</div>
                      <div className="text-muted-foreground">
                        {apiKey.displaySecretKey}
                      </div>
                    </TableCell>
                    <TableCell density="comfortable">
                      {apiKey.note || "—"}
                    </TableCell>
                    <TableCell density="comfortable">
                      {metadata.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {metadata.map(([key, value]) => (
                            <Badge key={key} variant="outline-solid">
                              {key}: {value}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell density="comfortable">
                      {renderRevokeAction(apiKey.id)}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

function getMetadataEntries(value: unknown): Array<[string, string]> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.entries(value).flatMap(([key, item]) =>
    item === null ||
    typeof item === "string" ||
    typeof item === "number" ||
    typeof item === "boolean"
      ? [[key, String(item)]]
      : [],
  );
}
