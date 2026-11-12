import { createTableColumn } from "@/src/components/design-system/table/columns/utils/createTableColumn";
import { Skeleton } from "@/src/components/ui/skeleton";
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
    loadingCell: <Skeleton className="h-5 w-16 shrink-0 rounded-sm" />,
    renderCell: (apiFormats) => (
      <GatewayRoutesCell apiFormats={apiFormats ?? []} />
    ),
  });
}
