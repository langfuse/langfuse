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

const providerLabel: Record<BlobStorageIntegration["type"], string> = {
  S3: "Amazon S3",
  S3_COMPATIBLE: "S3-compatible",
  AZURE_BLOB_STORAGE: "Azure Blob Storage",
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
        mapValue: (type) => providerLabel[type],
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
