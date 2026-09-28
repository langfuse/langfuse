import { Route } from "lucide-react";
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
import { CustomTooltip } from "@/src/components/design-system/CustomTooltip/CustomTooltip";
import { SingleLineOverflowList } from "@/src/components/SingleLineOverflowList";
import { Badge } from "@/src/components/ui/badge";
import { providerLabels } from "@/src/features/ai-gateway/constants/providerLabels";
import { gatewayModelsFilterConfig } from "@/src/features/ai-gateway/constants/modelsFilterConfig";
import type { GatewayProvider } from "@/src/features/ai-gateway/types/gatewayProvider";
import type { LangfuseColumnDef } from "@/src/components/table/types";
import type { GatewayModelRow } from "./fns/filterGatewayModels";

const columns: LangfuseColumnDef<GatewayModelRow>[] = [
  createTextTableColumn<GatewayModelRow>({
    accessorKey: "id",
    header: "Model",
    size: 200,
  }),
  {
    accessorKey: "availableVia",
    header: "Available via",
    size: 360,
    cell: ({ row }) => (
      <SingleLineOverflowList
        items={row.original.availableVia}
        additionalOverflowCount={0}
        getKey={(connection) => connection.connectionId}
        renderItem={(connection) => (
          <Badge
            variant="secondary"
            className="gap-1.5"
            aria-label={`${connection.connectionName}, ${providerLabels[connection.provider]}`}
          >
            <GatewayProviderIcon provider={connection.provider} />
            {connection.connectionName}
          </Badge>
        )}
        renderOverflow={({ hiddenItems, overflowItemCount }) => (
          <CustomTooltip
            content={
              <div className="flex flex-col gap-1">
                {hiddenItems.map((connection) => (
                  <span
                    key={connection.connectionId}
                    className="flex items-center gap-1.5"
                    aria-label={`${connection.connectionName}, ${providerLabels[connection.provider]}`}
                  >
                    <GatewayProviderIcon provider={connection.provider} />
                    {connection.connectionName}
                  </span>
                ))}
              </div>
            }
          >
            {({ getTriggerProps }) => (
              <span {...getTriggerProps()} className="inline-flex" tabIndex={0}>
                <Badge variant="secondary">+{overflowItemCount}</Badge>
              </span>
            )}
          </CustomTooltip>
        )}
      />
    ),
  },
  createBadgeListTableColumn<GatewayModelRow>({
    accessorKey: "apiFormats",
    header: "API formats",
    size: 280,
    getBadge: (format) => ({
      value: getApiFormatLabel(format),
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
        columns={columns}
        data={data}
        noResultsMessage={noResultsMessage}
      />
      <PaginationBar {...pagination} />
    </>
  );
}

function GatewayProviderIcon({ provider }: { provider: GatewayProvider }) {
  if (provider === "OPENAI")
    return <SiOpenai className="size-3" aria-hidden="true" />;
  if (provider === "ANTHROPIC")
    return <SiAnthropic className="size-3" aria-hidden="true" />;
  return <Route className="size-3" aria-hidden="true" />;
}

function getApiFormatLabel(format: string) {
  if (format === "Anthropic Messages") return "Messages";
  if (format === "OpenAI Chat Completions") return "Completions";
  if (format === "OpenAI Responses") return "Responses";
  return format;
}
