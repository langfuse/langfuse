import { createTableColumn } from "@/src/components/design-system/table/columns/utils/createTableColumn";
import { GatewayRoutesCell } from "@/src/features/ai-gateway/components/GatewayRoutesCell/GatewayRoutesCell";
import type { ApiFormat } from "@/src/features/ai-gateway/fns/getGatewayModelApiFormats";

export function createGatewayRoutesTableColumn<
  TData extends { apiFormats: ApiFormat[] },
>({ size }: { size: number }) {
  return createTableColumn<TData, ApiFormat[]>({
    id: "apiFormats",
    accessorFn: (row) => row.apiFormats,
    header: "Routes",
    size,
    loading: "badge",
    renderCell: (apiFormats) => (
      <GatewayRoutesCell apiFormats={apiFormats ?? []} />
    ),
  });
}
