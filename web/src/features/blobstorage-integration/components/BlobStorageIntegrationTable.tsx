import { useMemo } from "react";
import { Plus } from "lucide-react";

import {
  SettingsTable,
  type SettingsTableProps,
} from "@/src/components/SettingsTable/SettingsTable";
import { createStatusTableColumn } from "@/src/components/design-system/table/columns/createStatusTableColumn";
import { createTextTableColumn } from "@/src/components/design-system/table/columns/createTextTableColumn";
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
  onSelect,
  onCreate,
}: {
  integrations: BlobStorageIntegration[];
  onSelect: (integration: BlobStorageIntegration) => void;
  onCreate: () => void;
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
        header: "Status",
        getStatus: (status) => (status ? syncStatusToBadge[status] : undefined),
      }),
    ],
    [],
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
