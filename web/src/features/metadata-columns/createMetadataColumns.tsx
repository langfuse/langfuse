import { type LangfuseColumnDef } from "@/src/components/table/types";
import { MetadataTableCell } from "./MetadataTableCell";
import {
  getMetadataColumnId,
  getMetadataValue,
  type MetadataColumnConfig,
} from "./metadata-columns";

export function createMetadataColumns<
  TData extends { id: string; parsedMetadata: Record<string, unknown> | null },
>({
  metadataColumns,
  isIoPending,
  singleLine = false,
}: {
  metadataColumns: MetadataColumnConfig[];
  isIoPending: (id: string) => boolean;
  singleLine?: boolean;
}): LangfuseColumnDef<TData>[] {
  return metadataColumns.map((config) => {
    const id = getMetadataColumnId(config.key);
    const label = config.label?.trim() || config.key;
    return {
      id,
      accessorKey: id,
      accessorFn: (row) => getMetadataValue(row.parsedMetadata, config.key),
      header: label,
      headerLabel: label,
      headerClassName: "ph-no-capture",
      headerTooltip: {
        description: (
          <span className="ph-no-capture">Metadata key: {config.key}</span>
        ),
      },
      size: 220,
      enableHiding: true,
      enableSorting: false,
      sensitive: true,
      analyticsId: "metadata",
      cellPadding: "none",
      loadingCell: <MetadataTableCell isLoading singleLine={singleLine} />,
      cell: ({ row, getValue }) => {
        const value = getValue();
        const isLoading = isIoPending(row.original.id);
        if (!isLoading && (value === undefined || value === null)) return null;
        return (
          <MetadataTableCell
            value={value}
            isLoading={isLoading}
            singleLine={singleLine}
          />
        );
      },
    };
  });
}
