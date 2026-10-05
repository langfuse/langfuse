import {
  BlobStorageIntegrationType,
  BlobStorageIntegrationFileType,
  BlobStorageExportMode,
  OBSERVATION_FIELD_GROUPS_FULL,
  type BlobStorageIntegration,
  type ObservationFieldGroupFull,
  type ExportSourceContext,
} from "@langfuse/shared";
import { getExportSourceFormValue } from "@/src/features/analytics-integrations";
import { type BlobStorageFormValues } from "@/src/features/blobstorage-integration/types/blobStorageFormValues";

export function buildBlobStorageFormValues(
  state: Partial<BlobStorageIntegration> | undefined,
  exportSourceCtx: ExportSourceContext,
): BlobStorageFormValues {
  return {
    type: state?.type || BlobStorageIntegrationType.S3,
    bucketName: state?.bucketName || "",
    endpoint: state?.endpoint || null,
    region: state?.region || "auto",
    accessKeyId: state?.accessKeyId || "",
    secretAccessKey: state?.secretAccessKey || null,
    prefix: state?.prefix || "",
    mediaPrefix: state?.mediaPrefix || "",
    exportFrequency: (state?.exportFrequency ||
      "daily") as BlobStorageFormValues["exportFrequency"],
    enabled: state?.enabled ?? true,
    forcePathStyle: state?.forcePathStyle || false,
    fileType: state?.fileType || BlobStorageIntegrationFileType.PARQUET,
    exportMode: state?.exportMode || BlobStorageExportMode.FULL_HISTORY,
    exportStartDate: state?.exportStartDate || null,
    exportSource: getExportSourceFormValue(
      state?.exportSource,
      exportSourceCtx,
    ),
    // Empty array in the DB means "export everything" (the worker falls back
    // to all groups), so surface it as the full selection in the form.
    exportFieldGroups: state?.exportFieldGroups?.length
      ? (state.exportFieldGroups as ObservationFieldGroupFull[])
      : [...OBSERVATION_FIELD_GROUPS_FULL],
    compressed: state?.compressed ?? true,
    mediaStorageEnabled: state?.mediaStorageEnabled ?? false,
  };
}
