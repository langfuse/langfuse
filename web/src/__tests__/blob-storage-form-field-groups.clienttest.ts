import { renderHook, act } from "@testing-library/react";
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

describe("blob storage form — exportFieldGroups validation", () => {
  it("blocks submission when exportSource is EVENTS and all groups are deselected", async () => {
    const { result } = renderHook(() =>
      useForm<BlobStorageIntegrationFormSchema>({
        resolver: zodResolver(blobStorageIntegrationFormSchema),
        defaultValues: {
          ...VALID_BASE,
          exportSource: AnalyticsIntegrationExportSource.EVENTS,
          exportFieldGroups: [],
        },
      }),
    );

    const onSubmit = vi.fn();
    await act(async () => {
      await result.current.handleSubmit(onSubmit)();
    });

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("allows submission when exportSource is TRACES_OBSERVATIONS regardless of exportFieldGroups", async () => {
    const { result } = renderHook(() =>
      useForm<BlobStorageIntegrationFormSchema>({
        resolver: zodResolver(blobStorageIntegrationFormSchema),
        defaultValues: {
          ...VALID_BASE,
          exportSource: AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS,
          exportFieldGroups: [],
        },
      }),
    );

    const onSubmit = vi.fn();
    await act(async () => {
      await result.current.handleSubmit(onSubmit)();
    });

    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it("preserves a saved subset when switching exportSource away from EVENTS", async () => {
    const { result } = renderHook(() =>
      useForm<BlobStorageIntegrationFormSchema>({
        resolver: zodResolver(blobStorageIntegrationFormSchema),
        defaultValues: {
          ...VALID_BASE,
          exportSource: AnalyticsIntegrationExportSource.EVENTS,
          exportFieldGroups: ["core", "basic"],
        },
      }),
    );

    await act(async () => {
      result.current.setValue(
        "exportSource",
        AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS,
      );
    });

    // Subset must be preserved — no automatic reset
    expect(result.current.getValues("exportFieldGroups")).toStrictEqual([
      "core",
      "basic",
    ]);
  });
});
