import { SiAnthropic, SiOpenai } from "react-icons/si";

import {
  Table,
  type TableProps,
} from "@/src/components/design-system/table/Table";
import {
  PaginationBar,
  type PaginationBarProps,
} from "@/src/components/design-system/PaginationBar/PaginationBar";
import { createBadgeListTableColumn } from "@/src/components/design-system/table/columns/createBadgeListTableColumn";
import { createTextTableColumn } from "@/src/components/design-system/table/columns/createTextTableColumn";
import { providerLabels } from "@/src/features/ai-gateway/constants/providerLabels";
import { gatewayModelsFilterConfig } from "@/src/features/ai-gateway/constants/modelsFilterConfig";
import type { ApiFormat } from "@/src/features/ai-gateway/components/GatewayModelsPage/aggregateModels";
import type { GatewayProvider } from "@/src/features/ai-gateway/types/gatewayProvider";
import type { LangfuseColumnDef } from "@/src/components/table/types";
import type { GatewayModelRow } from "./fns/filterGatewayModels";

export const gatewayModelsColumns: LangfuseColumnDef<GatewayModelRow>[] = [
  createTextTableColumn<GatewayModelRow>({
    accessorKey: "id",
    header: "Model",
    size: 200,
  }),
  createBadgeListTableColumn<
    GatewayModelRow,
    GatewayModelRow["availableVia"][number]
  >({
    accessorKey: "availableVia",
    header: "Available via",
    size: 360,
    getBadge: (connection) => ({
      key: connection.connectionId,
      value: connection.connectionName,
      variant: connection.enabled ? "secondary" : "tertiary",
      icon: providerIcons[connection.provider],
      ariaLabel: `${connection.connectionName}, ${providerLabels[connection.provider]}, ${connection.enabled ? "enabled" : "disabled"}`,
    }),
  }),
  {
    accessorKey: "apiFormats",
    header: "Routes",
    size: 280,
    cell: ({ row }) =>
      row.original.apiFormats.length > 0
        ? row.original.apiFormats
            .map((format) => apiFormatLabels[format])
            .join(", ")
        : "Not routed",
  },
];

export function GatewayModelsTable({
  data,
  noResultsMessage,
  pagination,
}: {
  data: TableProps<GatewayModelRow>["data"];
  noResultsMessage: string;
  pagination: PaginationBarProps;
}) {
  return (
    <>
      <Table
        tableName={gatewayModelsFilterConfig.tableName}
        columns={gatewayModelsColumns}
        data={data}
        noResultsMessage={noResultsMessage}
      />
      <PaginationBar {...pagination} />
    </>
  );
}

const providerIcons = {
  OPENAI: SiOpenai,
  ANTHROPIC: SiAnthropic,
} satisfies Record<GatewayProvider, typeof SiOpenai>;

const apiFormatLabels = {
  "Anthropic Messages": "Messages",
  "OpenAI Chat Completions": "Completions",
  "OpenAI Responses": "Responses",
} satisfies Record<ApiFormat, string>;
