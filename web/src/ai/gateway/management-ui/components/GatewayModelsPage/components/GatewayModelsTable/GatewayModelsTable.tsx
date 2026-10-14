import { SiAnthropic, SiOpenai } from "react-icons/si";

import { Table, type TableProps } from "@/src/app/design-system/table/Table";
import {
  PaginationBar,
  type PaginationBarProps,
} from "@/src/app/design-system/PaginationBar/PaginationBar";
import { createBadgeListTableColumn } from "@/src/app/design-system/table/columns/createBadgeListTableColumn";
import { createTextTableColumn } from "@/src/app/design-system/table/columns/createTextTableColumn";
import { providerLabels } from "@/src/ai/gateway/management-ui/constants/providerLabels";
import { gatewayModelsFilterConfig } from "@/src/ai/gateway/management-ui/constants/modelsFilterConfig";
import type { ApiFormat } from "@/src/ai/gateway/management-ui/components/GatewayModelsPage/aggregateModels";
import type { GatewayProvider } from "@/src/ai/gateway/management-ui/types/gatewayProvider";
import type { LangfuseColumnDef } from "@/src/app/tables/common-components/types";
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
