import Link from "next/link";
import { useMemo } from "react";

import { BadgeShell } from "@/src/components/design-system/Badge/Badge";
import {
  Table,
  type TableProps,
} from "@/src/components/design-system/table/Table";
import {
  PaginationBar,
  type PaginationBarProps,
} from "@/src/components/design-system/PaginationBar/PaginationBar";
import { createTextTableColumn } from "@/src/components/design-system/table/columns/createTextTableColumn";
import { providerIcons } from "@/src/features/ai-gateway/constants/providerIcons";
import { providerLabels } from "@/src/features/ai-gateway/constants/providerLabels";
import type { ApiFormat } from "@/src/features/ai-gateway/components/GatewayModelsPage/fns/aggregateModels";
import { buildGatewayModelsUrl } from "@/src/features/ai-gateway/fns/gatewayUrls/buildGatewayModelsUrl";
import type { LangfuseColumnDef } from "@/src/components/table/types";
import type { GatewayModelRow } from "../../fns/filterGatewayModels";

const TABLE_NAME = "gateway-models";

export function GatewayModelsTable({
  organizationId,
  canManageGateway,
  data,
  noResultsMessage,
  pagination,
  onAfterModelCopy,
}: {
  organizationId: string;
  canManageGateway: boolean;
  data: TableProps<GatewayModelRow>["data"];
  noResultsMessage: string;
  pagination: PaginationBarProps;
  onAfterModelCopy?: (model: GatewayModelRow) => void;
}) {
  const columns = useMemo(
    () =>
      createGatewayModelsColumns({
        organizationId,
        canManageGateway,
        onAfterModelCopy,
      }),
    [canManageGateway, onAfterModelCopy, organizationId],
  );

  return (
    <>
      <Table
        tableName={TABLE_NAME}
        columns={columns}
        data={data}
        noResultsMessage={noResultsMessage}
      />
      <PaginationBar {...pagination} />
    </>
  );
}

function createGatewayModelsColumns({
  organizationId,
  canManageGateway,
  onAfterModelCopy,
}: Pick<
  Parameters<typeof GatewayModelsTable>[0],
  "organizationId" | "canManageGateway" | "onAfterModelCopy"
>): LangfuseColumnDef<GatewayModelRow>[] {
  return [
    createTextTableColumn<GatewayModelRow>({
      accessorKey: "id",
      header: "Model",
      size: 360,
      trailingAction: {
        type: "copy-to-clipboard",
        onAfterCopy: ({ row }) => onAfterModelCopy?.(row.original),
      },
    }),
    {
      accessorKey: "connectionName",
      header: "Provider",
      size: 280,
      cell: ({ row }) => (
        <ProviderBadge
          model={row.original}
          organizationId={organizationId}
          canManageGateway={canManageGateway}
        />
      ),
    },
    {
      accessorKey: "apiFormats",
      header: "Routes",
      size: 280,
      cell: ({ row }) =>
        row.original.apiFormats
          .map((format) => apiFormatLabels[format])
          .join(", "),
    },
  ];
}

function ProviderBadge({
  model,
  organizationId,
  canManageGateway,
}: {
  model: GatewayModelRow;
  organizationId: string;
  canManageGateway: boolean;
}) {
  const ProviderIcon = providerIcons[model.provider];
  const content = (
    <>
      <ProviderIcon aria-hidden size="sm" />
      <span className="truncate py-0.5" title={model.connectionName}>
        {model.connectionName}
      </span>
    </>
  );
  const ariaLabel = `${model.connectionName}, ${providerLabels[model.provider]}`;

  return canManageGateway ? (
    <BadgeShell asChild color="filled">
      <Link
        href={buildGatewayModelsUrl(organizationId, model.connectionId)}
        aria-label={`Show models for ${ariaLabel}`}
      >
        {content}
      </Link>
    </BadgeShell>
  ) : (
    <BadgeShell color="filled" aria-label={ariaLabel}>
      {content}
    </BadgeShell>
  );
}

const apiFormatLabels = {
  "Anthropic Messages": "Messages",
  "OpenAI Chat Completions": "Completions",
  "OpenAI Responses": "Responses",
} satisfies Record<ApiFormat, string>;
