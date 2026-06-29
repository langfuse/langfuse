import { renderHook, act } from "@testing-library/react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  type BlobStorageIntegrationFormSchema,
  blobStorageIntegrationFormSchema,
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
  it.each([
    [AnalyticsIntegrationExportSource.EVENTS, []],
    [AnalyticsIntegrationExportSource.EVENTS, ["basic", "io"]],
    [AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS_EVENTS, []],
    [
      AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS_EVENTS,
      ["basic", "io"],
    ],
  ] as const)(
    "blocks submission when exportSource is %s and core is absent (groups: %s)",
    async (source, exportFieldGroups) => {
      const { result } = renderHook(() =>
        useForm({
          resolver: zodResolver(blobStorageIntegrationFormSchema),
          defaultValues: {
            ...VALID_BASE,
            exportSource: source,
            exportFieldGroups: [...exportFieldGroups],
          },
        }),
      );

      const onSubmit = vi.fn();
      await act(async () => {
        await result.current.handleSubmit(onSubmit)();
      });

      expect(onSubmit).not.toHaveBeenCalled();
    },
  );

  it("allows submission when exportSource is TRACES_OBSERVATIONS regardless of exportFieldGroups", async () => {
    const { result } = renderHook(() =>
      useForm({
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
});
