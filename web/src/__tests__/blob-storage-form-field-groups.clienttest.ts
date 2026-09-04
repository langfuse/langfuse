import { renderHook, act } from "@testing-library/react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  type BlobStorageIntegrationFormSchema,
  blobStorageIntegrationFormSchema,
} from "@/src/features/blobstorage-integration/types";
import {
  AnalyticsIntegrationExportSource,
  OBSERVATION_FIELD_GROUPS_FULL,
  BlobStorageExportMode,
  BlobStorageIntegrationFileType,
  BlobStorageIntegrationType,
  EXPORT_FIELD_GROUP_OPTIONS,
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
  exportFieldGroups: [...OBSERVATION_FIELD_GROUPS_FULL],
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
    [AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS, []],
    [AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS, ["basic", "io"]],
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

  it("allows submission when exportSource is TRACES_OBSERVATIONS and core is included", async () => {
    const { result } = renderHook(() =>
      useForm({
        resolver: zodResolver(blobStorageIntegrationFormSchema),
        defaultValues: {
          ...VALID_BASE,
          exportSource: AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS,
          exportFieldGroups: ["core", "io"],
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

describe("EXPORT_FIELD_GROUP_OPTIONS — parquet description", () => {
  const PRICE_FIELDS = ["input_price", "output_price", "total_price"];
  const model = EXPORT_FIELD_GROUP_OPTIONS.find((o) => o.value === "model")!;

  it("model group lists price columns in the standard description", () => {
    expect(PRICE_FIELDS.every((f) => model.description.includes(f))).toBe(true);
  });

  it("model group drops price columns in the parquet description", () => {
    expect(PRICE_FIELDS.some((f) => model.parquetDescription.includes(f))).toBe(
      false,
    );
    // Non-price model columns are preserved.
    expect(model.parquetDescription).toContain("provided_model_name");
  });

  it("non-model groups have identical standard and parquet descriptions", () => {
    for (const option of EXPORT_FIELD_GROUP_OPTIONS) {
      if (option.value === "model") continue;
      expect(option.parquetDescription).toBe(option.description);
    }
  });

  it("legacy parquet drops prices and uses the narrower legacy schema", () => {
    const basic = EXPORT_FIELD_GROUP_OPTIONS.find((o) => o.value === "basic")!;
    const traceContext = EXPORT_FIELD_GROUP_OPTIONS.find(
      (o) => o.value === "trace_context",
    )!;

    // No price columns (parquet runs no enrichment) — unlike legacyDescription.
    expect(
      PRICE_FIELDS.some((f) => model.legacyParquetDescription.includes(f)),
    ).toBe(false);
    expect(PRICE_FIELDS.some((f) => model.legacyDescription.includes(f))).toBe(
      true,
    );

    // Enriched-only columns are absent from the legacy schema.
    expect(basic.parquetDescription).toContain("bookmarked");
    expect(basic.legacyParquetDescription).not.toContain("bookmarked");
    expect(traceContext.parquetDescription).toContain("trace_name");
    expect(traceContext.legacyParquetDescription).toBe(
      "Not included in the legacy observations export",
    );
  });

  it("flags groups without legacy observation columns so the UI can hide them for legacy-only exports", () => {
    for (const option of EXPORT_FIELD_GROUP_OPTIONS) {
      expect(option.includedInLegacyExport).toBe(
        option.value !== "trace_context",
      );
    }
  });
});
