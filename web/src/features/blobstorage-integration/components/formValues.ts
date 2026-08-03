import { type Control } from "react-hook-form";
import { type z } from "zod";
import {
  BlobStorageIntegrationType,
  BlobStorageIntegrationFileType,
  BlobStorageExportMode,
  OBSERVATION_FIELD_GROUPS_FULL,
  type BlobStorageIntegration,
  type ObservationFieldGroupFull,
} from "@langfuse/shared";
import type {
  blobStorageIntegrationFormSchema,
  BlobStorageIntegrationFormSchema,
} from "@/src/features/blobstorage-integration/types";
import { getExportSourceFormValue } from "@/src/features/analytics-integrations/exportSource";
import { type ExportSourceContext } from "@langfuse/shared";

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
    exportFrequency: (state?.exportFrequency ||
      "daily") as BlobStorageFormValues["exportFrequency"],
    enabled: state?.enabled || false,
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
