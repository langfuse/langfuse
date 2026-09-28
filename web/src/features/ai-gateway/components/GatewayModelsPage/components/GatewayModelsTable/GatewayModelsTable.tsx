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
      variant: "secondary",
      icon: providerIcons[connection.provider],
      ariaLabel: `${connection.connectionName}, ${providerLabels[connection.provider]}`,
    }),
  }),
  createBadgeListTableColumn<GatewayModelRow, ApiFormat>({
    accessorKey: "apiFormats",
    header: "API formats",
    size: 280,
    getBadge: (format) => ({
      value: apiFormatLabels[format],
      variant: "secondary",
    }),
  }),
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
