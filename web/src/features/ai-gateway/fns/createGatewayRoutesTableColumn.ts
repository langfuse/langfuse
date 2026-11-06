import { createBadgeListTableColumn } from "@/src/components/design-system/table/columns/createBadgeListTableColumn";
import type { ApiFormat } from "@/src/features/ai-gateway/fns/getGatewayModelApiFormats";

const apiFormatLabels = {
  "Anthropic Messages": "Messages",
  "OpenAI Chat Completions": "Completions",
  "OpenAI Responses": "Responses",
} satisfies Record<ApiFormat, string>;

export function createGatewayRoutesTableColumn<
  TData extends { apiFormats: ApiFormat[] },
>({ size }: { size: number }) {
  return createBadgeListTableColumn<TData, ApiFormat>({
    id: "apiFormats",
    accessorFn: (row) => row.apiFormats,
    header: "Routes",
    size,
    getBadge: (apiFormat) => ({
      key: apiFormat,
      value: apiFormatLabels[apiFormat],
      variant: "secondary",
    }),
  });
}
