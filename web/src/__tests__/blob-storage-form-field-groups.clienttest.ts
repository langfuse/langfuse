import { renderHook, act } from "@testing-library/react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  blobStorageIntegrationFormSchema,
  type BlobStorageIntegrationFormSchema,
} from "@/src/features/blobstorage-integration/types";
import {
  AnalyticsIntegrationExportSource,
  BLOB_EXPORT_FIELD_GROUPS,
  BlobStorageExportMode,
  BlobStorageIntegrationFileType,
  BlobStorageIntegrationType,
} from "@langfuse/shared";

const VALID_BASE: BlobStorageIntegrationFormSchema = {
  type: BlobStorageIntegrationType.S3,
  bucketName: "my-bucket",
  region: "us-east-1",
  exportFrequency: "daily",
  enabled: true,
  forcePathStyle: false,
  fileType: BlobStorageIntegrationFileType.JSONL,
  exportMode: BlobStorageExportMode.FULL_HISTORY,
  exportSource: AnalyticsIntegrationExportSource.EVENTS,
  exportFieldGroups: [...BLOB_EXPORT_FIELD_GROUPS],
  compressed: true,
  endpoint: null,
  accessKeyId: "",
  secretAccessKey: null,
  prefix: "",
  exportStartDate: null,
};

function useBlobStorageForm(defaults: BlobStorageIntegrationFormSchema) {
  const form = useForm<BlobStorageIntegrationFormSchema>({
    resolver: zodResolver(blobStorageIntegrationFormSchema),
    defaultValues: defaults,
    mode: "onChange",
  });

  const exportSource = form.watch("exportSource");

  useEffect(() => {
    if (exportSource !== AnalyticsIntegrationExportSource.EVENTS) {
      form.setValue("exportFieldGroups", [...BLOB_EXPORT_FIELD_GROUPS]);
    }
  }, [exportSource]); // eslint-disable-line react-hooks/exhaustive-deps

  return form;
}

describe("blob storage form — exportFieldGroups reset on source switch", () => {
  it("resets exportFieldGroups to the full default when switching away from EVENTS", async () => {
    const { result } = renderHook(() => useBlobStorageForm(VALID_BASE));

    // Simulate user unchecking all field groups while on EVENTS
    await act(async () => {
      result.current.setValue("exportFieldGroups", []);
    });
    expect(result.current.getValues("exportFieldGroups")).toStrictEqual([]);

    // Switch away from EVENTS — useEffect should reset exportFieldGroups
    await act(async () => {
      result.current.setValue(
        "exportSource",
        AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS,
      );
    });

    expect(result.current.getValues("exportFieldGroups")).toStrictEqual([
      ...BLOB_EXPORT_FIELD_GROUPS,
    ]);
  });

  it("allows submission after switching from EVENTS with empty groups to TRACES_OBSERVATIONS", async () => {
    const { result } = renderHook(() => useBlobStorageForm(VALID_BASE));

    await act(async () => {
      result.current.setValue("exportFieldGroups", []);
      result.current.setValue(
        "exportSource",
        AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS,
      );
    });

    const onSubmit = vi.fn();
    await act(async () => {
      await result.current.handleSubmit(onSubmit)();
    });

    expect(onSubmit).toHaveBeenCalledOnce();
  });
});
