import { type Control } from "react-hook-form";
import { type z } from "zod";
import {
  BlobStorageIntegrationType,
  BlobStorageIntegrationFileType,
  BlobStorageExportMode,
  OBSERVATION_FIELD_GROUPS_FULL,
  TRACE_EXPORT_FIELD_GROUPS,
  hasTraceFieldGroups,
  type BlobStorageIntegration,
  type ExportFieldGroup,
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

// Without a stored trace group the traces export is full, so show every trace
// group as selected; saving then stores the same full selection explicitly.
// trace_core is locked in the form and always kept in the selection.
function withTraceFieldGroups(groups: ExportFieldGroup[]): ExportFieldGroup[] {
  if (!hasTraceFieldGroups(groups)) {
    return [...groups, ...TRACE_EXPORT_FIELD_GROUPS];
  }
  return groups.includes("trace_core") ? groups : [...groups, "trace_core"];
}

// A full trace selection exports the same as no trace group, so it is stored
// without trace groups; the stored list then only names trace groups when the
// user deselected one.
export function toStoredFieldGroups(
  groups: ExportFieldGroup[],
): ExportFieldGroup[] {
  const isFullTraceSelection = TRACE_EXPORT_FIELD_GROUPS.every((group) =>
    groups.includes(group),
  );
  return isFullTraceSelection
    ? groups.filter(
        (group) =>
          !(TRACE_EXPORT_FIELD_GROUPS as readonly string[]).includes(group),
      )
    : groups;
}

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
    exportFieldGroups: withTraceFieldGroups(
      state?.exportFieldGroups?.length
        ? (state.exportFieldGroups as ExportFieldGroup[])
        : [...OBSERVATION_FIELD_GROUPS_FULL],
    ),
    compressed: state?.compressed ?? true,
  };
}
