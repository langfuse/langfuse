import { type Control } from "react-hook-form";
import { type z } from "zod";
import {
  BlobStorageIntegrationType,
  BlobStorageIntegrationFileType,
  BlobStorageExportMode,
  OBSERVATION_FIELD_GROUPS_FULL,
  type BlobStorageIntegration,
  type ObservationFieldGroupFull,
  type ExportSourceContext,
  GCS_USE_DEFAULT_CREDENTIALS,
} from "@langfuse/shared";
import type {
  blobStorageIntegrationFormSchema,
  BlobStorageIntegrationFormSchema,
} from "@/src/features/blobstorage-integration/types";
import { getExportSourceFormValue } from "@/src/features/analytics-integrations";

// Pre-parse (input) shape of the form; zod defaults make some fields optional.
export type BlobStorageFormValues = z.input<
  typeof blobStorageIntegrationFormSchema
>;

// Control handle shared by the form's field-group components.
export type BlobStorageFormControl = Control<
  BlobStorageFormValues,
  unknown,
  BlobStorageIntegrationFormSchema
>;

export function buildBlobStorageFormValues(
  state:
    | (Partial<BlobStorageIntegration> & { hasSecretAccessKey?: boolean })
    | undefined,
  exportSourceCtx: ExportSourceContext,
): BlobStorageFormValues {
  // A saved GCS integration with no stored key uses default credentials;
  // preselect that so re-saving does not demand a key.
  const isKeylessGcs =
    state?.type === BlobStorageIntegrationType.GOOGLE_CLOUD_STORAGE &&
    state.hasSecretAccessKey === false;
  return {
    type: state?.type || BlobStorageIntegrationType.S3,
    bucketName: state?.bucketName || "",
    endpoint: state?.endpoint || null,
    region: state?.region || "auto",
    accessKeyId: state?.accessKeyId || "",
    secretAccessKey: isKeylessGcs
      ? GCS_USE_DEFAULT_CREDENTIALS
      : state?.secretAccessKey || null,
    prefix: state?.prefix || "",
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
  };
}
