import { useCallback, useMemo } from "react";
import { Trash2 } from "lucide-react";

import { SettingsTable } from "@/src/components/SettingsTable/SettingsTable";
import { createStatusTableColumn } from "@/src/components/design-system/table/columns/createStatusTableColumn";
import { createTextTableColumn } from "@/src/components/design-system/table/columns/createTextTableColumn";
import { type TableProps } from "@/src/components/design-system/table/Table";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { deriveSyncStatus } from "@/src/features/blobstorage-integration/deriveSyncStatus";
import { type BlobStorageSyncStatus } from "@/src/features/blobstorage-integration/types";
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

const syncStatusToBadge: Record<BlobStorageSyncStatus, string> = {
  up_to_date: "active",
  running: "running",
  queued: "queued",
  idle: "pending",
  disabled: "disabled",
  error: "error",
};

export function BlobStorageIntegrationTable({
  integrations,
  showMediaStorage,
  onSelect,
  onDelete,
}: {
  integrations: BlobStorageIntegration[];
  showMediaStorage: boolean;
  onSelect: (integration: BlobStorageIntegration) => void;
  onDelete: (integration: BlobStorageIntegration) => void;
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
      createStatusTableColumn<BlobStorageIntegration, BlobStorageSyncStatus>({
        id: "status",
        accessorFn: (integration) =>
          deriveSyncStatus({
            enabled: integration.enabled,
            lastError: integration.lastError,
            lastSyncAt: integration.lastSyncAt,
            nextSyncAt: integration.nextSyncAt,
            runStartedAt: integration.runStartedAt,
          }),
        header: "Export status",
        getStatus: (status) => (status ? syncStatusToBadge[status] : undefined),
      }),
      ...(showMediaStorage
        ? [
            createStatusTableColumn<BlobStorageIntegration, boolean>({
              id: "mediaStorageEnabled",
              accessorFn: (integration) => integration.mediaStorageEnabled,
              header: "Media storage",
              getStatus: (enabled) => (enabled ? "enabled" : "disabled"),
            }),
          ]
        : []),
    ],
    [showMediaStorage],
  );
  const actions = useCallback<
    NonNullable<TableProps<BlobStorageIntegration>["actions"]>
  >(
    (integration) => [
      {
        id: "delete",
        type: "item",
        title: "Delete",
        icon: Trash2,
        variant: "destructive",
        onClick: () => onDelete(integration),
      },
    ],
    [onDelete],
  );

  return (
    <SettingsTable
      tableName="Blob storage integrations"
      columns={columns}
      data={{ status: "success", data: integrations }}
      actions={actions}
      onRowClick={onSelect}
      noResultsMessage="No blob storage integrations configured."
    />
  );
}
