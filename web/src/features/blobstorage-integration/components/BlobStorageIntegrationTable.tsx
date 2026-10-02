import { useMemo } from "react";
import { Plus } from "lucide-react";

import {
  SettingsTable,
  type SettingsTableProps,
} from "@/src/components/SettingsTable/SettingsTable";
import { createStatusTableColumn } from "@/src/components/design-system/table/columns/createStatusTableColumn";
import { createTextTableColumn } from "@/src/components/design-system/table/columns/createTextTableColumn";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { type RouterOutputs } from "@/src/utils/api";

type BlobStorageIntegration =
  RouterOutputs["blobStorageIntegration"]["get"]["configs"][number];

const getProviderLabel = (type: string | null | undefined) => {
  switch (type) {
    case "S3":
      return "Amazon S3";
    case "S3_COMPATIBLE":
      return "S3-compatible";
    case "AZURE_BLOB_STORAGE":
      return "Azure Blob Storage";
    default:
      return "Unknown";
  }
};

export function BlobStorageIntegrationTable({
  integrations,
  onSelect,
  onCreate,
  showMediaStorage,
}: {
  integrations: BlobStorageIntegration[];
  onSelect: (integration: BlobStorageIntegration) => void;
  onCreate: () => void;
  showMediaStorage: boolean;
}) {
  const columns = useMemo<LangfuseColumnDef<BlobStorageIntegration>[]>(
    () => [
      createTextTableColumn<BlobStorageIntegration>({
        accessorKey: "bucketName",
        header: "Bucket",
      }),
      createTextTableColumn<BlobStorageIntegration>({
        accessorKey: "type",
        header: "Provider",
        mapValue: getProviderLabel,
      }),
      createStatusTableColumn<BlobStorageIntegration, boolean>({
        accessorKey: "enabled",
        header: "Exports",
        getStatus: (enabled) => (enabled ? "active" : "disabled"),
      }),
      ...(showMediaStorage
        ? [
            createStatusTableColumn<BlobStorageIntegration, boolean>({
              accessorKey: "mediaStorageEnabled",
              header: "Media",
              getStatus: (enabled) => (enabled ? "active" : "disabled"),
            }),
          ]
        : []),
    ],
    [showMediaStorage],
  );
  const toolbarActions: SettingsTableProps<BlobStorageIntegration>["toolbarActions"] =
    [
      {
        id: "add-integration",
        label: "Add integration",
        variant: "secondary",
        icon: <Plus className="size-4" aria-hidden="true" />,
        onClick: onCreate,
      },
    ];

  return (
    <SettingsTable
      tableName="Blob storage integrations"
      columns={columns}
      data={{ status: "success", data: integrations }}
      toolbarActions={toolbarActions}
      onRowClick={onSelect}
      noResultsMessage="No blob storage integrations configured."
    />
  );
}
