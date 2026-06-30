import {
  expect,
  it,
  describe,
  beforeAll,
  beforeEach,
  afterEach,
  afterAll,
  vi,
} from "vitest";

const originalCloudRegion = vi.hoisted(() => {
  const cloudRegion = process.env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;
  delete process.env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;
  return cloudRegion;
});

// Override recordIncrement + recordHistogram so the attempt counter and
// per-stage timing metrics are assertable.
const mockRecordIncrement = vi.hoisted(() => vi.fn());
const mockRecordHistogram = vi.hoisted(() => vi.fn());
vi.mock("@langfuse/shared/src/server", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@langfuse/shared/src/server")>();
  return {
    ...actual,
    recordIncrement: mockRecordIncrement,
    recordHistogram: mockRecordHistogram,
  };
});

import { env } from "../env";
import { randomUUID } from "crypto";
import {
  createObservation,
  createObservationsCh,
  createOrgProjectAndApiKey,
  createTraceScore,
  createSessionScore,
  createDatasetRunScore,
  createScoresCh,
  createTrace,
  createTracesCh,
  createEvent,
  createEventsCh,
  StorageService,
  StorageServiceFactory,
} from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";
import { Job } from "bullmq";
import {
  handleBlobStorageIntegrationProjectJob,
  BLOB_STORAGE_LAG_BUFFER_MS,
} from "../features/blobstorage/handleBlobStorageIntegrationProjectJob";
import {
  BlobStorageIntegrationType,
  BlobStorageIntegrationFileType,
} from "@langfuse/shared";
import { encrypt } from "@langfuse/shared/encryption";

// Skip tests that use Azurite in Azure mode due to known Azurite limitations
// with multipart uploads. These tests use MinIO explicitly or are skipped.
// Unfortunately, this is necessary as we don't have a good way to skip empty file uploads
// and at least azurite doesn't handle them gracefully.
const maybeIt = env.LANGFUSE_USE_AZURE_BLOB === "true" ? it.skip : it;
const maybeDescribe =
  process.env.LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN === "true"
    ? describe
    : describe.skip;

describe("BlobStorageIntegrationProcessingJob", () => {
  let storageService: StorageService;
  let s3StorageService: StorageService;
  let s3Prefix: string | null = null;
  const bucketName = env.LANGFUSE_S3_EVENT_UPLOAD_BUCKET || "";
  const accessKeyId = env.LANGFUSE_S3_EVENT_UPLOAD_ACCESS_KEY_ID || "";
  const secretAccessKey = env.LANGFUSE_S3_EVENT_UPLOAD_SECRET_ACCESS_KEY || "";
  const endpoint = env.LANGFUSE_S3_EVENT_UPLOAD_ENDPOINT || undefined;
  const region = env.LANGFUSE_S3_EVENT_UPLOAD_REGION || undefined;
  const minioAccessKeyId = "minio";
  const minioAccessKeySecret = "miniosecret";
  const minioEndpoint = "http://localhost:9090";

  beforeAll(async () => {
    storageService = StorageServiceFactory.getInstance({
      accessKeyId,
      secretAccessKey,
      bucketName,
      endpoint,
      region,
      forcePathStyle: env.LANGFUSE_S3_EVENT_UPLOAD_FORCE_PATH_STYLE === "true",
    });
    s3StorageService = StorageServiceFactory.getInstance({
      accessKeyId: minioAccessKeyId,
      secretAccessKey: minioAccessKeySecret,
      bucketName,
      endpoint: minioEndpoint,
      region,
      forcePathStyle: true,
      useAzureBlob: false,
    });
  });

  afterAll(() => {
    if (originalCloudRegion) {
      process.env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = originalCloudRegion;
    } else {
      delete process.env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;
    }
  });

  afterEach(async () => {
    // Clean up all files created during this test
    if (!s3Prefix) return;

    const files = await s3StorageService.listFiles(s3Prefix);

    if (files.length == 0) return;

    await s3StorageService.deleteFiles(files.map((f) => f.file));
    s3Prefix = null;
  });

  // LFE-10296: a persisted enriched export source on a deployment without the
  // enriched export path (e.g. after a V4-preview rollback) must fail the job
  // loudly instead of silently exporting from unpopulated tables.
  describe("enriched export source guard", () => {
    const originalV4Preview = env.LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN;

    afterEach(() => {
      (env as any).LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN =
        originalV4Preview;
    });

    it("fails the job and persists lastError when the enriched export path is unavailable", async () => {
      (env as any).LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN = "false";
      const { projectId } = await createOrgProjectAndApiKey();
      s3Prefix = projectId;

      await prisma.blobStorageIntegration.create({
        data: {
          projectId,
          type: BlobStorageIntegrationType.S3,
          bucketName,
          prefix: s3Prefix,
          accessKeyId,
          secretAccessKey: encrypt(secretAccessKey),
          region: region ? region : "auto",
          endpoint: endpoint ? endpoint : null,
          forcePathStyle:
            env.LANGFUSE_S3_EVENT_UPLOAD_FORCE_PATH_STYLE === "true",
          enabled: true,
          exportFrequency: "daily",
          exportSource: "EVENTS",
          // A past lastSyncAt yields a non-empty export window without
          // requiring ClickHouse data.
          lastSyncAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        },
      });

      await expect(
        handleBlobStorageIntegrationProjectJob({
          data: { payload: { projectId } },
        } as Job),
      ).rejects.toThrow(/enriched/i);

      const row = await prisma.blobStorageIntegration.findUniqueOrThrow({
        where: { projectId },
      });
      expect(row.lastError).toMatch(/enriched/i);
      expect(row.lastErrorAt).not.toBeNull();

      // Nothing was exported.
      const files = await storageService.listFiles(s3Prefix);
      expect(files.filter((f) => f.file.includes(projectId))).toHaveLength(0);
    });
  });

  it("should not process when blob storage integration is disabled", async () => {
    const { projectId } = await createOrgProjectAndApiKey();
    s3Prefix = projectId;

    // Setup an integration but disabled
    await prisma.blobStorageIntegration.create({
      data: {
        projectId,
        type: BlobStorageIntegrationType.S3,
        bucketName,
        prefix: s3Prefix,
        accessKeyId,
        secretAccessKey: encrypt(secretAccessKey),
        region: region ? region : "auto",
        endpoint: endpoint ? endpoint : null,
        forcePathStyle:
          env.LANGFUSE_S3_EVENT_UPLOAD_FORCE_PATH_STYLE === "true",
        enabled: false,
        exportFrequency: "hourly",
        compressed: false,
      },
    });

    // When
    await handleBlobStorageIntegrationProjectJob({
      data: { payload: { projectId } },
    } as Job);

    // Then
    const files = await storageService.listFiles(s3Prefix);
    expect(files.filter((f) => f.file.includes(projectId))).toHaveLength(0);
  });

  // LFE-10441: per-stage timing histograms must also be emitted when an export
  // fails (originally gated on upload success), tagged outcome="failure" so the
  // happy-path percentiles stay clean.
  it("emits per-stage timing histograms tagged outcome=failure when the upload fails", async () => {
    const { projectId } = await createOrgProjectAndApiKey();
    s3Prefix = projectId;

    await prisma.blobStorageIntegration.create({
      data: {
        projectId,
        type: BlobStorageIntegrationType.S3,
        bucketName,
        prefix: s3Prefix,
        accessKeyId: minioAccessKeyId,
        secretAccessKey: encrypt(minioAccessKeySecret),
        region: region ? region : "auto",
        // endpoint null -> skip the persisted-endpoint preflight; the storage
        // service is mocked anyway, so no real connection is made.
        endpoint: null,
        forcePathStyle:
          env.LANGFUSE_S3_EVENT_UPLOAD_FORCE_PATH_STYLE === "true",
        enabled: true,
        exportFrequency: "daily",
        // Non-enriched source: sidesteps the enriched-export guard regardless of
        // V4 preview state, so this runs outside maybeDescribe on every CI leg.
        exportSource: "TRACES_OBSERVATIONS",
        // A past lastSyncAt yields a non-empty export window without requiring
        // the ClickHouse min-timestamp probe.
        lastSyncAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      },
    });

    // Force every upload to reject so the export takes the failure path.
    const getInstanceSpy = vi
      .spyOn(StorageServiceFactory, "getInstance")
      .mockReturnValue({
        uploadFileBuffered: vi
          .fn()
          .mockRejectedValue(new Error("simulated upload failure")),
      } as unknown as StorageService);

    mockRecordIncrement.mockClear();
    mockRecordHistogram.mockClear();

    try {
      await expect(
        handleBlobStorageIntegrationProjectJob({
          data: { payload: { projectId } },
        } as Job),
      ).rejects.toThrow(/simulated upload failure/i);
    } finally {
      getInstanceSpy.mockRestore();
    }

    // Failure attempt counter fired.
    expect(mockRecordIncrement).toHaveBeenCalledWith(
      "langfuse.blobstorage.table_export.count",
      1,
      expect.objectContaining({ outcome: "failure", projectId }),
    );

    // All four stage timers emitted with outcome=failure...
    for (const metric of [
      "langfuse.blob_export.ch_read_ms",
      "langfuse.blob_export.enrich_ms",
      "langfuse.blob_export.gzip_cpu_ms",
      "langfuse.blob_export.upload_wait_ms",
    ]) {
      expect(mockRecordHistogram).toHaveBeenCalledWith(
        metric,
        expect.any(Number),
        expect.objectContaining({ outcome: "failure" }),
      );
    }

    // ...and never with outcome=success, since no upload succeeded.
    expect(mockRecordHistogram).not.toHaveBeenCalledWith(
      "langfuse.blob_export.ch_read_ms",
      expect.any(Number),
      expect.objectContaining({ outcome: "success" }),
    );
  });

  maybeDescribe("events table export tests", () => {
    it("should export traces, generations, and scores to S3", async () => {
      // Setup
      const { projectId } = await createOrgProjectAndApiKey();
      s3Prefix = projectId;
      const now = new Date();
      const sessionScoreId = randomUUID();
      const sessionId = randomUUID();
      const datasetRunScoreId = randomUUID();
      const datasetRunId = randomUUID();
      // Set lastSyncAt to 2 hours ago so the chunked export (1 hour window) covers recent data
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

      // Create integration
      await prisma.blobStorageIntegration.create({
        data: {
          projectId,
          type: BlobStorageIntegrationType.S3,
          bucketName,
          prefix: s3Prefix,
          accessKeyId: minioAccessKeyId,
          secretAccessKey: encrypt(minioAccessKeySecret),
          region: region ? region : "auto",
          endpoint: minioEndpoint,
          forcePathStyle:
            env.LANGFUSE_S3_EVENT_UPLOAD_FORCE_PATH_STYLE === "true",
          enabled: true,
          exportFrequency: "hourly",
          exportSource: "TRACES_OBSERVATIONS_EVENTS",
          nextSyncAt: twoHoursAgo,
          lastSyncAt: twoHoursAgo,
          compressed: false,
        },
      });

      // Create test data within the export window (2 hours ago to 1 hour ago)
      // With 20-min lag buffer, actual window is 2h ago to (1h ago or now-20min, whichever is earlier)
      const traceId = randomUUID();
      const observationId = randomUUID();
      const scoreId = randomUUID();
      const modelId = randomUUID();

      const dataTime = now.getTime() - 90 * 60 * 1000; // 90 minutes before now

      // Create a Model + PricingTier + Prices in Postgres for model enrichment
      await prisma.model.create({
        data: {
          id: modelId,
          projectId,
          modelName: "gpt-4-test",
          matchPattern: "gpt-4-test",
          unit: "TOKENS",
          pricingTiers: {
            create: {
              name: "Standard",
              isDefault: true,
              conditions: [],
              priority: 0,
              prices: {
                createMany: {
                  data: [
                    { modelId, usageType: "input", price: "0.03" },
                    { modelId, usageType: "output", price: "0.06" },
                    { modelId, usageType: "total", price: "0.09" },
                  ],
                },
              },
            },
          },
        },
      });

      // Create event data for events table export
      const event = createEvent({
        project_id: projectId,
        trace_id: traceId,
        type: "GENERATION",
        name: "Test Event",
        start_time: dataTime * 1000, // microseconds
        end_time: (dataTime + 5000) * 1000, // 5s later (microseconds)
        bookmarked: true,
        public: true,
        model_id: modelId,
      });

      // Create trace, observation, score, and event in Clickhouse
      // Data is at 90 minutes ago, which falls within the chunked export window
      await Promise.all([
        createTracesCh([
          createTrace({
            id: traceId,
            project_id: projectId,
            timestamp: dataTime,
            name: "Test Trace",
          }),
        ]),
        createObservationsCh([
          createObservation({
            id: observationId,
            trace_id: traceId,
            project_id: projectId,
            start_time: dataTime,
            end_time: dataTime + 5000, // 5s later
            completion_start_time: dataTime + 1000, // 1s later
            total_cost: 42.5,
            usage_details: { input: 100, output: 200, total: 300 },
            internal_model_id: modelId,
            name: "Test Observation",
          }),
        ]),
        createScoresCh([
          createTraceScore({
            id: scoreId,
            trace_id: traceId,
            project_id: projectId,
            timestamp: dataTime,
            name: "Test Score",
            value: 0.95,
          }),
          createSessionScore({
            id: sessionScoreId,
            session_id: sessionId,
            project_id: projectId,
            timestamp: dataTime,
            name: "Test Session Score",
            value: 0.8,
          }),
          createDatasetRunScore({
            id: datasetRunScoreId,
            dataset_run_id: datasetRunId,
            project_id: projectId,
            timestamp: dataTime,
            name: "Test Dataset Run Score",
            value: 0.7,
          }),
        ]),
        createEventsCh([event]),
      ]);

      // When
      mockRecordIncrement.mockClear();
      await handleBlobStorageIntegrationProjectJob({
        data: { payload: { projectId } },
      } as Job);

      // Then
      // Each of the 4 tables emits a started + success attempt counter (LFE-10407).
      for (const table of [
        "traces",
        "observations",
        "scores",
        "observations_v2",
      ]) {
        for (const outcome of ["started", "success"]) {
          expect(mockRecordIncrement).toHaveBeenCalledWith(
            "langfuse.blobstorage.table_export.count",
            1,
            { outcome, table, projectId },
          );
        }
      }

      const files = await s3StorageService.listFiles(s3Prefix);
      const projectFiles = files.filter((f) => f.file.includes(projectId));

      // Should have 4 files (traces, observations, scores, events)
      expect(projectFiles).toHaveLength(4);

      // Check file paths follow the expected pattern
      const traceFile = projectFiles.find((f) => f.file.includes("/traces/"));
      const observationFile = projectFiles.find((f) =>
        f.file.includes("/observations/"),
      );
      const scoreFile = projectFiles.find((f) => f.file.includes("/scores/"));
      const eventFile = projectFiles.find((f) =>
        f.file.includes("/observations_v2/"),
      );

      expect(traceFile).toBeDefined();
      expect(observationFile).toBeDefined();
      expect(scoreFile).toBeDefined();
      expect(eventFile).toBeDefined();

      // Check file contents
      if (traceFile) {
        const content = await s3StorageService.download(traceFile.file);
        expect(content).toContain(traceId);
        expect(content).toContain("Test Trace");
        // Verify new fields: created_at, updated_at
        expect(content).toContain("created_at");
        expect(content).toContain("updated_at");
      }

      if (observationFile) {
        const content = await s3StorageService.download(observationFile.file);
        expect(content).toContain(observationId);
        expect(content).toContain("Test Observation");
        // Verify new fields: total_cost, latency, time_to_first_token
        expect(content).toContain("total_cost");
        expect(content).toContain("latency");
        expect(content).toContain("time_to_first_token");
        // Verify usage_details map contains actual token counts (CSV escapes " as "")
        expect(content).toContain('""input"":100');
        expect(content).toContain('""output"":200');
        // Verify model pricing enrichment
        expect(content).toContain("input_price");
        expect(content).toContain("output_price");
        expect(content).toContain("total_price");
        expect(content).toContain("0.03");
        expect(content).toContain("0.06");
        // Verify newly added native fields
        expect(content).toContain("prompt_id");
        expect(content).toContain("tool_calls");
        expect(content).toContain("tool_definitions");
        expect(content).toContain("usage_pricing_tier_name");
      }

      if (scoreFile) {
        const content = await s3StorageService.download(scoreFile.file);
        expect(content).toContain(scoreId);
        expect(content).toContain("Test Score");
        expect(content).toContain("0.95");
        // Verify session_id is exported for session-scoped scores
        expect(content).toContain(sessionScoreId);
        expect(content).toContain(sessionId);
        expect(content).toContain("Test Session Score");
        expect(content).toContain("0.8");
        // Verify dataset_run_id is exported for dataset-run-scoped scores
        expect(content).toContain(datasetRunScoreId);
        expect(content).toContain(datasetRunId);
        expect(content).toContain("Test Dataset Run Score");
        expect(content).toContain("0.7");
        // Verify new fields: created_at, updated_at
        expect(content).toContain("created_at");
        expect(content).toContain("updated_at");
      }

      if (eventFile) {
        const content = await s3StorageService.download(eventFile.file);
        expect(content).toContain(event.span_id);
        expect(content).toContain("Test Event");
        // Verify new fields: bookmarked, public, created_at, updated_at
        expect(content).toContain("bookmarked");
        expect(content).toContain("public");
        expect(content).toContain("created_at");
        expect(content).toContain("updated_at");
        // Verify usage_details map contains actual token counts (CSV escapes " as "")
        expect(content).toContain('""input"":1234');
        expect(content).toContain('""output"":5678');
        // Verify model pricing enrichment with actual values
        expect(content).toContain("input_price");
        expect(content).toContain("output_price");
        expect(content).toContain("total_price");
        expect(content).toContain("0.03");
        expect(content).toContain("0.06");
        // Verify newly added native fields
        expect(content).toContain("tool_calls");
        expect(content).toContain("tool_definitions");
        expect(content).toContain("usage_pricing_tier_name");
      }

      // Check integration lastSyncAt and nextSyncAt are updated
      const updatedIntegration = await prisma.blobStorageIntegration.findUnique(
        {
          where: { projectId },
        },
      );

      if (updatedIntegration?.lastSyncAt && updatedIntegration?.nextSyncAt) {
        expect(updatedIntegration.lastSyncAt.getTime()).toBeGreaterThan(
          twoHoursAgo.getTime(),
        );
        expect(updatedIntegration.nextSyncAt.getTime()).toBeGreaterThan(
          now.getTime(),
        );
      } else {
        expect.fail("Integration should have lastSyncAt and nextSyncAt set");
      }
    });

    it("should exclude columns for deselected exportFieldGroups", async () => {
      // Regression test for two known ClickHouse/enrichment leaks:
      // 1. ClickHouse always returns {} for unselected Map columns (metadata)
      // 2. enrichObservationStream was writing latency:null even when metrics not selected
      const { projectId } = await createOrgProjectAndApiKey();
      s3Prefix = projectId;
      const now = new Date();
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
      const dataTime = now.getTime() - 90 * 60 * 1000;

      await prisma.blobStorageIntegration.create({
        data: {
          projectId,
          type: BlobStorageIntegrationType.S3,
          bucketName,
          prefix: s3Prefix,
          accessKeyId: minioAccessKeyId,
          secretAccessKey: encrypt(minioAccessKeySecret),
          region: region ? region : "auto",
          endpoint: minioEndpoint,
          forcePathStyle:
            env.LANGFUSE_S3_EVENT_UPLOAD_FORCE_PATH_STYLE === "true",
          enabled: true,
          exportFrequency: "hourly",
          exportSource: "EVENTS",
          exportFieldGroups: ["core", "io"],
          nextSyncAt: twoHoursAgo,
          lastSyncAt: twoHoursAgo,
          compressed: false,
          fileType: BlobStorageIntegrationFileType.JSONL,
        },
      });

      const traceId = randomUUID();
      const event = createEvent({
        project_id: projectId,
        trace_id: traceId,
        type: "GENERATION",
        name: "Test Event",
        start_time: dataTime * 1000,
        end_time: (dataTime + 5000) * 1000,
        metadata: { secret: "should-not-appear" },
        metadata_names: ["secret"],
        metadata_values: ["should-not-appear"],
      });

      await createEventsCh([event]);

      await handleBlobStorageIntegrationProjectJob({
        data: { payload: { projectId } },
      } as Job);

      const files = await s3StorageService.listFiles(s3Prefix);
      const eventFile = files.find((f) => f.file.includes("/observations_v2/"));
      expect(eventFile).toBeDefined();

      if (eventFile) {
        const content = await s3StorageService.download(eventFile.file);
        const row = JSON.parse(content.trim().split("\n")[0]);

        // core + io fields should be present
        expect(row).toHaveProperty("id");
        expect(row).toHaveProperty("trace_id");
        expect(row).toHaveProperty("input");
        expect(row).toHaveProperty("output");

        // metadata group not selected → must not leak even as {}
        expect(row).not.toHaveProperty("metadata");

        // metrics group not selected → latency/time_to_first_token must not appear
        expect(row).not.toHaveProperty("latency");
        expect(row).not.toHaveProperty("time_to_first_token");

        // non-selected groups must not appear
        expect(row).not.toHaveProperty("name");
        expect(row).not.toHaveProperty("level");
        expect(row).not.toHaveProperty("usage_details");
      }
    });

    it("should respect export frequency when setting nextSyncAt", async () => {
      const { projectId } = await createOrgProjectAndApiKey();

      // Setup for weekly export
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

      await prisma.blobStorageIntegration.create({
        data: {
          projectId,
          type: BlobStorageIntegrationType.S3,
          bucketName,
          prefix: "",
          accessKeyId: minioAccessKeyId,
          secretAccessKey: encrypt(minioAccessKeySecret),
          region: region,
          endpoint: minioEndpoint,
          forcePathStyle:
            env.LANGFUSE_S3_EVENT_UPLOAD_FORCE_PATH_STYLE === "true",
          enabled: true,
          exportFrequency: "weekly",
          lastSyncAt: oneHourAgo,
          compressed: false,
        },
      });

      // Create test data
      const traceId = randomUUID();
      await createTracesCh([
        createTrace({
          id: traceId,
          project_id: projectId,
          timestamp: oneHourAgo.getTime() + 10 * 60 * 1000,
        }),
      ]);

      // When
      await handleBlobStorageIntegrationProjectJob({
        data: { payload: { projectId } },
      } as Job);

      // Then
      const updatedIntegration = await prisma.blobStorageIntegration.findUnique(
        {
          where: { projectId },
        },
      );

      // Should be set to 7 days in the future from maxTimestamp (now - lag buffer)
      const expectedNextSync = new Date(
        now.getTime() - BLOB_STORAGE_LAG_BUFFER_MS + 7 * 24 * 60 * 60 * 1000,
      );

      if (updatedIntegration?.nextSyncAt) {
        // Use a tolerance value in milliseconds instead of numeric precision
        const tolerance = 1000; // 1 second tolerance
        expect(
          Math.abs(
            updatedIntegration.nextSyncAt.getTime() -
              expectedNextSync.getTime(),
          ),
        ).toBeLessThan(tolerance);
      } else {
        expect.fail("Integration should have nextSyncAt set");
      }
    });

    it("should use prefix in file path when specified", async () => {
      // Setup
      const { projectId } = await createOrgProjectAndApiKey();
      s3Prefix = "test-prefix";
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

      await prisma.blobStorageIntegration.create({
        data: {
          projectId,
          type: BlobStorageIntegrationType.S3,
          bucketName,
          prefix: s3Prefix,
          accessKeyId: minioAccessKeyId,
          secretAccessKey: encrypt(minioAccessKeySecret),
          region: region ? region : "auto",
          endpoint: minioEndpoint,
          forcePathStyle:
            env.LANGFUSE_S3_EVENT_UPLOAD_FORCE_PATH_STYLE === "true",
          enabled: true,
          exportFrequency: "daily",
          lastSyncAt: oneHourAgo,
          compressed: false,
        },
      });

      // Create test data
      const traceId = randomUUID();
      await createTracesCh([
        createTrace({
          id: traceId,
          project_id: projectId,
          timestamp: oneHourAgo.getTime() + 10 * 60 * 1000,
        }),
      ]);

      // When
      await handleBlobStorageIntegrationProjectJob({
        data: { payload: { projectId } },
      } as Job);

      // Then
      const files = await storageService.listFiles(s3Prefix);
      const projectFiles = files.filter((f) => f.file.includes(projectId));

      // All files should have the prefix
      expect(projectFiles.every((f) => f.file.startsWith(s3Prefix))).toBe(true);
    });

    it("should handle CSV, JSON, and JSONL file types correctly", async () => {
      // Setup
      const { projectId } = await createOrgProjectAndApiKey();
      s3Prefix = `${projectId}/`;
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

      // Create test data
      const traceId = randomUUID();
      const observationId = randomUUID();
      const scoreId = randomUUID();

      // Create event data for events table export
      const event = createEvent({
        project_id: projectId,
        trace_id: traceId,
        type: "GENERATION",
        name: "Test Event",
        start_time: (now.getTime() - 35 * 60 * 1000) * 1000, // 35 minutes before now (microseconds)
      });

      await Promise.all([
        createTracesCh([
          createTrace({
            id: traceId,
            project_id: projectId,
            timestamp: now.getTime() - 40 * 60 * 1000, // 40 min before now
            name: "Test Trace",
          }),
        ]),
        createObservationsCh([
          createObservation({
            id: observationId,
            trace_id: traceId,
            project_id: projectId,
            start_time: now.getTime() - 35 * 60 * 1000, // 35 minutes before now
            name: "Test Observation",
          }),
        ]),
        createScoresCh([
          createTraceScore({
            id: scoreId,
            trace_id: traceId,
            project_id: projectId,
            timestamp: now.getTime() - 35 * 60 * 1000, // 35 minutes before now
            name: "Test Score",
            value: 0.95,
          }),
        ]),
        createEventsCh([event]),
      ]);

      // Test each file type
      for (const fileType of [
        BlobStorageIntegrationFileType.CSV,
        BlobStorageIntegrationFileType.JSON,
        BlobStorageIntegrationFileType.JSONL,
      ]) {
        const fileTypePrefix = `${fileType.toLowerCase()}-test/`;
        const prefix = `${s3Prefix}${fileTypePrefix}`;

        // Create integration with specific file type
        await prisma.blobStorageIntegration.upsert({
          where: { projectId },
          update: {
            prefix,
            fileType,
            lastSyncAt: oneHourAgo,
          },
          create: {
            projectId,
            type: BlobStorageIntegrationType.S3,
            bucketName,
            prefix,
            accessKeyId: minioAccessKeyId,
            secretAccessKey: encrypt(minioAccessKeySecret),
            region: region ? region : "auto",
            endpoint: minioEndpoint,
            forcePathStyle:
              env.LANGFUSE_S3_EVENT_UPLOAD_FORCE_PATH_STYLE === "true",
            enabled: true,
            exportFrequency: "hourly",
            exportSource: "TRACES_OBSERVATIONS_EVENTS",
            fileType,
            lastSyncAt: oneHourAgo,
            compressed: false,
          },
        });

        // Process the integration
        await handleBlobStorageIntegrationProjectJob({
          data: { payload: { projectId } },
        } as Job);

        // Get files for this file type
        const files = await s3StorageService.listFiles(prefix);
        const projectFiles = files.filter(
          (f) => f.file.includes(projectId) && f.file.includes(fileTypePrefix),
        );

        // Should have 4 files (traces, observations, scores, events)
        expect(projectFiles).toHaveLength(4);

        // Check file extensions
        const expectedExtension = fileType.toLowerCase();
        expect(
          projectFiles.every((f) => f.file.endsWith(`.${expectedExtension}`)),
        ).toBe(true);

        // Check file contents for each type
        for (const file of projectFiles) {
          const content = await s3StorageService.download(file.file);

          // Verify content based on file type
          if (file.file.includes("/traces/")) {
            expect(content).toContain(traceId);
            expect(content).toContain("Test Trace");
          } else if (file.file.includes("/observations/")) {
            expect(content).toContain(observationId);
            expect(content).toContain("Test Observation");
          } else if (file.file.includes("/scores/")) {
            expect(content).toContain(scoreId);
            expect(content).toContain("Test Score");
            expect(content).toContain("0.95");
          } else if (file.file.includes("/events/")) {
            expect(content).toContain(event.span_id);
            expect(content).toContain("Test Event");
          }

          // Verify format based on file type
          switch (fileType) {
            case BlobStorageIntegrationFileType.CSV:
              // CSV should have commas and newlines
              expect(content).toContain(",");
              break;
            case BlobStorageIntegrationFileType.JSON:
              // JSON should be parseable and have array brackets
              expect(content.trim().startsWith("[")).toBe(true);
              expect(content.trim().endsWith("]")).toBe(true);
              expect(() => JSON.parse(content)).not.toThrow();
              break;
            case BlobStorageIntegrationFileType.JSONL:
              // JSONL should have newlines and each line should be parseable JSON
              const lines = content.trim().split("\n");
              expect(lines.length).toBeGreaterThan(0);
              // Check first line is valid JSON
              expect(() => JSON.parse(lines[0])).not.toThrow();
              break;
          }
        }
      }
    });
  });

  describe("legacy observations export field groups", () => {
    it("should exclude columns for deselected exportFieldGroups in the legacy observations export", async () => {
      const { projectId } = await createOrgProjectAndApiKey();
      s3Prefix = projectId;
      const now = new Date();
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
      const dataTime = now.getTime() - 90 * 60 * 1000;

      await prisma.blobStorageIntegration.create({
        data: {
          projectId,
          type: BlobStorageIntegrationType.S3,
          bucketName,
          prefix: s3Prefix,
          accessKeyId: minioAccessKeyId,
          secretAccessKey: encrypt(minioAccessKeySecret),
          region: region ? region : "auto",
          endpoint: minioEndpoint,
          forcePathStyle:
            env.LANGFUSE_S3_EVENT_UPLOAD_FORCE_PATH_STYLE === "true",
          enabled: true,
          exportFrequency: "hourly",
          exportSource: "TRACES_OBSERVATIONS",
          exportFieldGroups: ["core", "io"],
          nextSyncAt: twoHoursAgo,
          lastSyncAt: twoHoursAgo,
          compressed: false,
          fileType: BlobStorageIntegrationFileType.JSONL,
        },
      });

      const traceId = randomUUID();
      await createObservationsCh([
        createObservation({
          id: randomUUID(),
          trace_id: traceId,
          project_id: projectId,
          start_time: dataTime,
          end_time: dataTime + 5000,
          name: "Legacy Observation",
          metadata: { secret: "should-not-appear" },
          usage_details: { input: 100, output: 200, total: 300 },
        }),
      ]);

      await handleBlobStorageIntegrationProjectJob({
        data: { payload: { projectId } },
      } as Job);

      const files = await s3StorageService.listFiles(s3Prefix);
      const observationFile = files.find((f) =>
        f.file.includes("/observations/"),
      );
      expect(observationFile).toBeDefined();

      if (observationFile) {
        const content = await s3StorageService.download(observationFile.file);
        const row = JSON.parse(content.trim().split("\n")[0]);

        // core + io fields should be present
        expect(row).toHaveProperty("id");
        expect(row).toHaveProperty("trace_id");
        expect(row).toHaveProperty("input");
        expect(row).toHaveProperty("output");

        // metadata group not selected → must not leak
        expect(row).not.toHaveProperty("metadata");

        // metrics group not selected → computed fields must not appear
        expect(row).not.toHaveProperty("latency");
        expect(row).not.toHaveProperty("time_to_first_token");

        // model group not selected → no model id or pricing enrichment
        expect(row).not.toHaveProperty("model_id");
        expect(row).not.toHaveProperty("input_price");

        // other non-selected groups must not appear
        expect(row).not.toHaveProperty("name");
        expect(row).not.toHaveProperty("level");
        expect(row).not.toHaveProperty("usage_details");
      }
    });
  });

  describe("BlobStorageExportMode minTimestamp behavior", () => {
    maybeIt(
      "should export old data for FULL_HISTORY mode when data exists",
      async () => {
        const { projectId } = await createOrgProjectAndApiKey();
        s3Prefix = projectId;

        // Create trace with old timestamp that's far enough in the past
        // but not so old that it might not be found by ClickHouse
        const now = new Date();
        const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
        const oldTrace = createTrace({
          project_id: projectId,
          timestamp: twoDaysAgo.getTime(),
          name: "Old Trace",
        });
        await createTracesCh([oldTrace]);

        // Create integration with FULL_HISTORY mode and no lastSyncAt
        await prisma.blobStorageIntegration.create({
          data: {
            projectId,
            type: BlobStorageIntegrationType.S3,
            bucketName,
            prefix: s3Prefix,
            accessKeyId,
            secretAccessKey: encrypt(secretAccessKey),
            region: region ? region : "auto",
            endpoint: endpoint ? endpoint : null,
            forcePathStyle:
              env.LANGFUSE_S3_EVENT_UPLOAD_FORCE_PATH_STYLE === "true",
            enabled: true,
            exportFrequency: "hourly",
            exportMode: "FULL_HISTORY",
            exportStartDate: null,
            lastSyncAt: null, // First export
            compressed: false,
          },
        });

        await handleBlobStorageIntegrationProjectJob({
          data: { payload: { projectId } },
        } as Job);

        // If data was found and exported, check the files
        const files = await storageService.listFiles(s3Prefix);
        const projectFiles = files.filter((f) => f.file.includes(projectId));

        // With FULL_HISTORY mode, if the ClickHouse query finds the old data,
        // it should export starting from that timestamp
        if (projectFiles.length > 0) {
          const traceFile = projectFiles.find((f) =>
            f.file.includes("/traces/"),
          );
          expect(traceFile).toBeDefined();

          if (traceFile) {
            const content = await storageService.download(traceFile.file);
            expect(content).toContain(oldTrace.id);
          }
        }

        // Verify integration was updated if export happened
        const updatedIntegration =
          await prisma.blobStorageIntegration.findUnique({
            where: { projectId },
          });

        // If files were exported, lastSyncAt should be set
        if (projectFiles.length > 0) {
          expect(updatedIntegration?.lastSyncAt).toBeDefined();
        }
      },
    );

    it("should use current date for FROM_TODAY mode on first export", async () => {
      const { projectId } = await createOrgProjectAndApiKey();
      s3Prefix = projectId;
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const veryOldTrace = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000); // 2 days ago

      // Create traces from different time periods
      const oldTrace = createTrace({
        project_id: projectId,
        timestamp: yesterday.getTime(),
        name: "Old Trace",
      });
      const veryOldTraceObj = createTrace({
        project_id: projectId,
        timestamp: veryOldTrace.getTime(),
        name: "Very Old Trace",
      });
      await createTracesCh([oldTrace, veryOldTraceObj]);

      // Create integration with FROM_TODAY mode
      await prisma.blobStorageIntegration.create({
        data: {
          projectId,
          type: BlobStorageIntegrationType.S3,
          bucketName,
          prefix: s3Prefix,
          accessKeyId,
          secretAccessKey: encrypt(secretAccessKey),
          region: region ? region : "auto",
          endpoint: endpoint ? endpoint : null,
          forcePathStyle:
            env.LANGFUSE_S3_EVENT_UPLOAD_FORCE_PATH_STYLE === "true",
          enabled: true,
          exportFrequency: "hourly",
          exportMode: "FROM_TODAY" as any,
          exportStartDate: new Date(), // Use current date
          lastSyncAt: null, // First export
          compressed: false,
        },
      });

      await handleBlobStorageIntegrationProjectJob({
        data: { payload: { projectId } },
      } as Job);

      const files = await storageService.listFiles(s3Prefix);
      const projectFiles = files.filter((f) => f.file.includes(projectId));
      const traceFile = projectFiles.find((f) => f.file.includes("/traces/"));

      // On azure the empty file is not created, for others we proceed to check that it's empty.
      if (traceFile) {
        const content = await storageService.download(traceFile.file);
        // With FROM_TODAY mode and a current exportStartDate, the minTimestamp is set to the provided date (current time)
        // which means only traces within the last 30 minutes would be exported
        // Our test traces are older, so content should be empty or not contain old traces
        expect(content).not.toContain(oldTrace.id);
        expect(content).not.toContain(veryOldTraceObj.id);
      }
    });

    it("should use custom date for FROM_CUSTOM_DATE mode on first export", async () => {
      const { projectId } = await createOrgProjectAndApiKey();
      s3Prefix = projectId;
      const now = new Date();
      const customDate = new Date(now.getTime() - 12 * 60 * 60 * 1000); // 12 hours ago
      const beforeCustomDate = new Date(customDate.getTime() - 60 * 60 * 1000); // 13 hours ago
      // With chunking, first export covers customDate to customDate + 1 hour
      // So we need data within that first hour window
      const afterCustomDate = new Date(customDate.getTime() + 30 * 60 * 1000); // 30 minutes after custom date

      // Create traces before and after custom date
      const oldTrace = createTrace({
        project_id: projectId,
        timestamp: beforeCustomDate.getTime(),
        name: "Before Custom Date Trace",
      });
      const recentTrace = createTrace({
        project_id: projectId,
        timestamp: afterCustomDate.getTime(),
        name: "After Custom Date Trace",
      });
      await createTracesCh([oldTrace, recentTrace]);

      // Create integration with FROM_CUSTOM_DATE mode
      await prisma.blobStorageIntegration.create({
        data: {
          projectId,
          type: BlobStorageIntegrationType.S3,
          bucketName,
          prefix: s3Prefix,
          accessKeyId: minioAccessKeyId,
          secretAccessKey: encrypt(minioAccessKeySecret),
          region: region ? region : "auto",
          endpoint: minioEndpoint,
          forcePathStyle:
            env.LANGFUSE_S3_EVENT_UPLOAD_FORCE_PATH_STYLE === "true",
          enabled: true,
          exportFrequency: "hourly",
          exportMode: "FROM_CUSTOM_DATE" as any,
          exportStartDate: customDate,
          lastSyncAt: null, // First export
          compressed: false,
        },
      });

      await handleBlobStorageIntegrationProjectJob({
        data: { payload: { projectId } },
      } as Job);

      const files = await s3StorageService.listFiles(s3Prefix);
      const projectFiles = files.filter((f) => f.file.includes(projectId));
      const traceFile = projectFiles.find((f) => f.file.includes("/traces/"));

      expect(traceFile).toBeDefined();

      // Should only include traces from custom date onwards
      if (traceFile) {
        const content = await s3StorageService.download(traceFile.file);
        expect(content).not.toContain(oldTrace.id);
        expect(content).toContain(recentTrace.id);
      }
    });
  });

  describe("Chunked historic exports", () => {
    maybeIt(
      "should cap maxTimestamp to one frequency period ahead for FULL_HISTORY mode",
      async () => {
        const { projectId } = await createOrgProjectAndApiKey();
        s3Prefix = projectId;
        const now = new Date();
        const veryOldTimestamp = new Date(
          now.getTime() - 7 * 24 * 60 * 60 * 1000,
        ); // 7 days ago

        // Create trace from 7 days ago
        const oldTrace = createTrace({
          project_id: projectId,
          timestamp: veryOldTimestamp.getTime(),
          name: "Old Trace",
        });
        await createTracesCh([oldTrace]);

        // Create integration with FULL_HISTORY and hourly frequency (first export)
        await prisma.blobStorageIntegration.create({
          data: {
            projectId,
            type: BlobStorageIntegrationType.S3,
            bucketName,
            prefix: s3Prefix,
            accessKeyId,
            secretAccessKey: encrypt(secretAccessKey),
            region: region ? region : "auto",
            endpoint: endpoint ? endpoint : null,
            forcePathStyle:
              env.LANGFUSE_S3_EVENT_UPLOAD_FORCE_PATH_STYLE === "true",
            enabled: true,
            exportFrequency: "hourly",
            exportMode: "FULL_HISTORY",
            exportStartDate: null,
            lastSyncAt: null,
            compressed: false,
          },
        });

        // When
        await handleBlobStorageIntegrationProjectJob({
          data: { payload: { projectId } },
        } as Job);

        // Then
        const updatedIntegration =
          await prisma.blobStorageIntegration.findUnique({
            where: { projectId },
          });

        expect(updatedIntegration).toBeDefined();

        // Check if files were exported (meaning data was found)
        const files = await storageService.listFiles(s3Prefix);
        const projectFiles = files.filter((f) => f.file.includes(projectId));

        // If data was found and exported, verify chunking behavior
        if (projectFiles.length > 0 && updatedIntegration?.lastSyncAt) {
          // When ClickHouse finds the old data, it should start from that timestamp
          // and cap the export to 1 hour (frequency interval)
          // lastSyncAt should be capped to 1 hour after the found timestamp
          const minExpectedTime = veryOldTimestamp.getTime();
          const maxExpectedTime = veryOldTimestamp.getTime() + 60 * 60 * 1000; // +1 hour
          const tolerance = 2000; // 2 second tolerance

          expect(
            updatedIntegration.lastSyncAt.getTime(),
          ).toBeGreaterThanOrEqual(minExpectedTime);
          expect(updatedIntegration.lastSyncAt.getTime()).toBeLessThanOrEqual(
            maxExpectedTime + tolerance,
          );
        }
        // If no data was found (fallback to current time), the time window would be invalid
        // and no export would happen, which is acceptable behavior
      },
    );

    it("should immediately schedule next chunk when in catch-up mode", async () => {
      const { projectId } = await createOrgProjectAndApiKey();
      s3Prefix = projectId;
      const now = new Date();
      const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

      // Create traces over 2 days
      const trace1 = createTrace({
        project_id: projectId,
        timestamp: twoDaysAgo.getTime(),
        name: "Old Trace 1",
      });
      const trace2 = createTrace({
        project_id: projectId,
        timestamp: twoDaysAgo.getTime() + 60 * 60 * 1000, // 1 hour later
        name: "Old Trace 2",
      });
      await createTracesCh([trace1, trace2]);

      // Create integration with hourly frequency starting 2 days ago
      await prisma.blobStorageIntegration.create({
        data: {
          projectId,
          type: BlobStorageIntegrationType.S3,
          bucketName,
          prefix: s3Prefix,
          accessKeyId: minioAccessKeyId,
          secretAccessKey: encrypt(minioAccessKeySecret),
          region: region ? region : "auto",
          endpoint: minioEndpoint,
          forcePathStyle:
            env.LANGFUSE_S3_EVENT_UPLOAD_FORCE_PATH_STYLE === "true",
          enabled: true,
          exportFrequency: "hourly",
          lastSyncAt: twoDaysAgo, // Start from 2 days ago
          compressed: false,
        },
      });

      // When
      await handleBlobStorageIntegrationProjectJob({
        data: { payload: { projectId } },
      } as Job);

      // Then
      const updatedIntegration = await prisma.blobStorageIntegration.findUnique(
        {
          where: { projectId },
        },
      );

      expect(updatedIntegration).toBeDefined();
      if (!updatedIntegration?.nextSyncAt) {
        expect.fail("nextSyncAt should be set");
      }

      // nextSyncAt should be immediate (within a few seconds of now)
      const timeDiff = Math.abs(
        updatedIntegration.nextSyncAt.getTime() - now.getTime(),
      );
      expect(timeDiff).toBeLessThan(5000); // Within 5 seconds
    });

    it("should schedule normally when caught up", async () => {
      const { projectId } = await createOrgProjectAndApiKey();
      s3Prefix = projectId;
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

      // Create recent trace
      const trace = createTrace({
        project_id: projectId,
        timestamp: now.getTime() - 40 * 60 * 1000, // 40 minutes ago
        name: "Recent Trace",
      });
      await createTracesCh([trace]);

      // Create integration with lastSyncAt 1 hour ago (within normal range)
      await prisma.blobStorageIntegration.create({
        data: {
          projectId,
          type: BlobStorageIntegrationType.S3,
          bucketName,
          prefix: s3Prefix,
          accessKeyId: minioAccessKeyId,
          secretAccessKey: encrypt(minioAccessKeySecret),
          region: region ? region : "auto",
          endpoint: minioEndpoint,
          forcePathStyle:
            env.LANGFUSE_S3_EVENT_UPLOAD_FORCE_PATH_STYLE === "true",
          enabled: true,
          exportFrequency: "hourly",
          lastSyncAt: oneHourAgo,
          compressed: false,
        },
      });

      // When
      await handleBlobStorageIntegrationProjectJob({
        data: { payload: { projectId } },
      } as Job);

      // Then
      const updatedIntegration = await prisma.blobStorageIntegration.findUnique(
        {
          where: { projectId },
        },
      );

      expect(updatedIntegration).toBeDefined();
      if (!updatedIntegration?.nextSyncAt || !updatedIntegration?.lastSyncAt) {
        expect.fail("nextSyncAt and lastSyncAt should be set");
      }

      // nextSyncAt should be 1 hour after lastSyncAt (normal scheduling)
      const expectedNextSync = new Date(
        updatedIntegration.lastSyncAt.getTime() + 60 * 60 * 1000,
      );
      const tolerance = 1000; // 1 second tolerance

      expect(
        Math.abs(
          updatedIntegration.nextSyncAt.getTime() - expectedNextSync.getTime(),
        ),
      ).toBeLessThan(tolerance);

      // nextSyncAt should be in the future
      expect(updatedIntegration.nextSyncAt.getTime()).toBeGreaterThan(
        now.getTime(),
      );
    });
  });

  describe("gzip compression", () => {
    maybeIt(
      "should produce .csv.gz files when compressed is true",
      async () => {
        const { projectId } = await createOrgProjectAndApiKey();
        s3Prefix = `${projectId}/`;
        const now = new Date();
        const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

        await prisma.blobStorageIntegration.create({
          data: {
            projectId,
            type: BlobStorageIntegrationType.S3,
            bucketName,
            prefix: s3Prefix,
            accessKeyId: minioAccessKeyId,
            secretAccessKey: encrypt(minioAccessKeySecret),
            region: region ? region : "auto",
            endpoint: minioEndpoint,
            forcePathStyle:
              env.LANGFUSE_S3_EVENT_UPLOAD_FORCE_PATH_STYLE === "true",
            enabled: true,
            exportFrequency: "hourly",
            fileType: BlobStorageIntegrationFileType.CSV,
            compressed: true,
            lastSyncAt: oneHourAgo,
          },
        });

        const traceId = randomUUID();
        await createTracesCh([
          createTrace({
            id: traceId,
            project_id: projectId,
            timestamp: now.getTime() - 40 * 60 * 1000,
            name: "Compressed Trace",
          }),
        ]);

        await handleBlobStorageIntegrationProjectJob({
          data: { payload: { projectId } },
        } as Job);

        const files = await s3StorageService.listFiles(s3Prefix);
        const projectFiles = files.filter((f) => f.file.includes(projectId));

        expect(projectFiles.length).toBeGreaterThan(0);
        expect(projectFiles.every((f) => f.file.endsWith(".csv.gz"))).toBe(
          true,
        );
      },
    );

    maybeIt(
      "should produce plain .csv files when compressed is false",
      async () => {
        const { projectId } = await createOrgProjectAndApiKey();
        s3Prefix = `${projectId}/`;
        const now = new Date();
        const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

        await prisma.blobStorageIntegration.create({
          data: {
            projectId,
            type: BlobStorageIntegrationType.S3,
            bucketName,
            prefix: s3Prefix,
            accessKeyId: minioAccessKeyId,
            secretAccessKey: encrypt(minioAccessKeySecret),
            region: region ? region : "auto",
            endpoint: minioEndpoint,
            forcePathStyle:
              env.LANGFUSE_S3_EVENT_UPLOAD_FORCE_PATH_STYLE === "true",
            enabled: true,
            exportFrequency: "hourly",
            fileType: BlobStorageIntegrationFileType.CSV,
            compressed: false,
            lastSyncAt: oneHourAgo,
          },
        });

        const traceId = randomUUID();
        await createTracesCh([
          createTrace({
            id: traceId,
            project_id: projectId,
            timestamp: now.getTime() - 40 * 60 * 1000,
            name: "Uncompressed Trace",
          }),
        ]);

        await handleBlobStorageIntegrationProjectJob({
          data: { payload: { projectId } },
        } as Job);

        const files = await s3StorageService.listFiles(s3Prefix);
        const projectFiles = files.filter((f) => f.file.includes(projectId));

        expect(projectFiles.length).toBeGreaterThan(0);
        expect(
          projectFiles.every(
            (f) => f.file.endsWith(".csv") && !f.file.endsWith(".csv.gz"),
          ),
        ).toBe(true);

        // Verify content is plain text (readable)
        const traceFile = projectFiles.find((f) => f.file.includes("/traces/"));
        if (traceFile) {
          const content = await s3StorageService.download(traceFile.file);
          expect(content).toContain(traceId);
          expect(content).toContain("Uncompressed Trace");
        }
      },
    );

    maybeIt(
      "should produce .jsonl.gz files when compressed with JSONL format",
      async () => {
        const { projectId } = await createOrgProjectAndApiKey();
        s3Prefix = `${projectId}/`;
        const now = new Date();
        const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

        await prisma.blobStorageIntegration.create({
          data: {
            projectId,
            type: BlobStorageIntegrationType.S3,
            bucketName,
            prefix: s3Prefix,
            accessKeyId: minioAccessKeyId,
            secretAccessKey: encrypt(minioAccessKeySecret),
            region: region ? region : "auto",
            endpoint: minioEndpoint,
            forcePathStyle:
              env.LANGFUSE_S3_EVENT_UPLOAD_FORCE_PATH_STYLE === "true",
            enabled: true,
            exportFrequency: "hourly",
            fileType: BlobStorageIntegrationFileType.JSONL,
            compressed: true,
            lastSyncAt: oneHourAgo,
          },
        });

        const traceId = randomUUID();
        await createTracesCh([
          createTrace({
            id: traceId,
            project_id: projectId,
            timestamp: now.getTime() - 40 * 60 * 1000,
            name: "JSONL Compressed Trace",
          }),
        ]);

        await handleBlobStorageIntegrationProjectJob({
          data: { payload: { projectId } },
        } as Job);

        const files = await s3StorageService.listFiles(s3Prefix);
        const projectFiles = files.filter((f) => f.file.includes(projectId));

        expect(projectFiles.length).toBeGreaterThan(0);
        expect(projectFiles.every((f) => f.file.endsWith(".jsonl.gz"))).toBe(
          true,
        );
      },
    );
  });

  // LFE-10402: raw-passthrough streams ClickHouse JSONEachRow bytes straight to
  // gzip → upload, skipping the per-row JS parse/enrich/serialize pipeline. The
  // output must be parsed-equal to the standard path minus the dropped price
  // columns. Passthrough only applies to JSONL exports of observations /
  // observations_v2 and is gated behind the exportTuning.rawPassthrough flag.
  maybeDescribe("raw passthrough export (LFE-10402)", () => {
    const PRICE_COLUMNS = ["input_price", "output_price", "total_price"];
    const stripPrices = (row: Record<string, unknown>) => {
      const copy = { ...row };
      for (const col of PRICE_COLUMNS) delete copy[col];
      return copy;
    };
    const parseJsonl = (content: string): Record<string, unknown>[] =>
      content
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line));
    const byId = (rows: Record<string, unknown>[]) =>
      new Map(rows.map((r) => [r.id as string, r]));

    const downloadDir = async (prefix: string, dir: string) => {
      const files = await s3StorageService.listFiles(prefix);
      const file = files.find((f) => f.file.includes(`/${dir}/`));
      expect(file).toBeDefined();
      return parseJsonl(await s3StorageService.download(file!.file));
    };

    const seedModelWithPrices = async (projectId: string, modelId: string) =>
      prisma.model.create({
        data: {
          id: modelId,
          projectId,
          modelName: "gpt-4-passthrough",
          matchPattern: "gpt-4-passthrough",
          unit: "TOKENS",
          pricingTiers: {
            create: {
              name: "Standard",
              isDefault: true,
              conditions: [],
              priority: 0,
              prices: {
                createMany: {
                  data: [
                    { modelId, usageType: "input", price: "0.03" },
                    { modelId, usageType: "output", price: "0.06" },
                    { modelId, usageType: "total", price: "0.09" },
                  ],
                },
              },
            },
          },
        },
      });

    it("produces output parsed-equal to the standard path (minus price columns) for observations + events", async () => {
      const { projectId } = await createOrgProjectAndApiKey();
      s3Prefix = projectId;
      const now = new Date();
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
      const dataTime = now.getTime() - 90 * 60 * 1000;
      const modelId = randomUUID();
      const traceId = randomUUID();
      const observationId = randomUUID();
      const eventId = randomUUID();

      await seedModelWithPrices(projectId, modelId);

      await prisma.blobStorageIntegration.create({
        data: {
          projectId,
          type: BlobStorageIntegrationType.S3,
          bucketName,
          prefix: s3Prefix,
          accessKeyId: minioAccessKeyId,
          secretAccessKey: encrypt(minioAccessKeySecret),
          region: region ? region : "auto",
          endpoint: minioEndpoint,
          forcePathStyle:
            env.LANGFUSE_S3_EVENT_UPLOAD_FORCE_PATH_STYLE === "true",
          enabled: true,
          exportFrequency: "hourly",
          exportSource: "TRACES_OBSERVATIONS_EVENTS",
          nextSyncAt: twoHoursAgo,
          lastSyncAt: twoHoursAgo,
          compressed: false,
          fileType: BlobStorageIntegrationFileType.JSONL,
          // default (full) field groups → metadata + model selected in both paths
        },
      });

      await Promise.all([
        createTracesCh([
          createTrace({
            id: traceId,
            project_id: projectId,
            timestamp: dataTime,
            name: "Passthrough Trace",
          }),
        ]),
        createObservationsCh([
          createObservation({
            id: observationId,
            trace_id: traceId,
            project_id: projectId,
            start_time: dataTime,
            end_time: dataTime + 5500, // 5.5s → non-round latency
            completion_start_time: dataTime + 1000,
            total_cost: 42.5,
            usage_details: { input: 100, output: 200, total: 300 },
            internal_model_id: modelId,
            name: "Passthrough Observation",
            metadata: { k: "v" },
          }),
        ]),
        createEventsCh([
          createEvent({
            id: eventId,
            project_id: projectId,
            trace_id: traceId,
            type: "GENERATION",
            name: "Passthrough Event",
            start_time: dataTime * 1000,
            end_time: (dataTime + 5500) * 1000,
            completion_start_time: (dataTime + 1000) * 1000,
            model_id: modelId,
            metadata: { k: "v" },
            metadata_names: ["k"],
            metadata_values: ["v"],
          }),
        ]),
      ]);

      // 1) Standard path
      await handleBlobStorageIntegrationProjectJob({
        data: { payload: { projectId } },
      } as Job);
      const standardObs = byId(await downloadDir(s3Prefix, "observations"));
      const standardEvents = byId(
        await downloadDir(s3Prefix, "observations_v2"),
      );

      // Sanity: the standard path enriches with price columns. Events export
      // is keyed by span_id (not the seeded event id), so grab the single row.
      const standardEventRow = [...standardEvents.values()][0];
      expect(standardObs.get(observationId)).toHaveProperty("input_price");
      expect(standardEventRow).toHaveProperty("total_price");

      // 2) Reset and re-run with rawPassthrough enabled.
      const filesToClear = await s3StorageService.listFiles(s3Prefix);
      await s3StorageService.deleteFiles(filesToClear.map((f) => f.file));
      await prisma.blobStorageIntegration.update({
        where: { projectId },
        data: {
          lastSyncAt: twoHoursAgo,
          nextSyncAt: twoHoursAgo,
          exportTuning: { rawPassthrough: true },
        },
      });

      await handleBlobStorageIntegrationProjectJob({
        data: { payload: { projectId } },
      } as Job);
      const passthroughObs = byId(await downloadDir(s3Prefix, "observations"));
      const passthroughEvents = byId(
        await downloadDir(s3Prefix, "observations_v2"),
      );

      // Passthrough drops the price columns…
      const passthroughEventRow = [...passthroughEvents.values()][0];
      expect(passthroughObs.get(observationId)).not.toHaveProperty(
        "input_price",
      );
      expect(passthroughEventRow).not.toHaveProperty("total_price");

      // …and is otherwise parsed-equal to the standard output.
      expect(passthroughObs.size).toBe(standardObs.size);
      expect(passthroughEvents.size).toBe(standardEvents.size);
      for (const [id, standardRow] of standardObs) {
        expect(passthroughObs.get(id)).toEqual(stripPrices(standardRow));
      }
      for (const [id, standardRow] of standardEvents) {
        expect(passthroughEvents.get(id)).toEqual(stripPrices(standardRow));
      }
    }, 60_000);

    it("falls back to the standard path when fileType is not JSONL", async () => {
      const { projectId } = await createOrgProjectAndApiKey();
      s3Prefix = projectId;
      const now = new Date();
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
      const dataTime = now.getTime() - 90 * 60 * 1000;
      const eventId = randomUUID();

      await prisma.blobStorageIntegration.create({
        data: {
          projectId,
          type: BlobStorageIntegrationType.S3,
          bucketName,
          prefix: s3Prefix,
          accessKeyId: minioAccessKeyId,
          secretAccessKey: encrypt(minioAccessKeySecret),
          region: region ? region : "auto",
          endpoint: minioEndpoint,
          forcePathStyle:
            env.LANGFUSE_S3_EVENT_UPLOAD_FORCE_PATH_STYLE === "true",
          enabled: true,
          exportFrequency: "hourly",
          exportSource: "EVENTS",
          nextSyncAt: twoHoursAgo,
          lastSyncAt: twoHoursAgo,
          compressed: false,
          // CSV is ineligible for passthrough → standard path despite the flag
          fileType: BlobStorageIntegrationFileType.CSV,
          exportTuning: { rawPassthrough: true },
        },
      });

      await createEventsCh([
        createEvent({
          id: eventId,
          project_id: projectId,
          trace_id: randomUUID(),
          type: "GENERATION",
          name: "CSV Fallback Event",
          start_time: dataTime * 1000,
          end_time: (dataTime + 5000) * 1000,
        }),
      ]);

      await handleBlobStorageIntegrationProjectJob({
        data: { payload: { projectId } },
      } as Job);

      const eventRows = await s3StorageService.listFiles(s3Prefix);
      const eventFile = eventRows.find((f) =>
        f.file.includes("/observations_v2/"),
      );
      expect(eventFile).toBeDefined();
      const content = await s3StorageService.download(eventFile!.file);
      // CSV header row present → standard (CSV) path ran, not JSONL passthrough.
      // (Events export keys by span_id, so assert on the seeded event name.)
      expect(content.split("\n")[0]).toContain("id");
      expect(content).toContain("CSV Fallback Event");
    }, 30_000);
  });

  maybeDescribe("Parquet export (LFE-10463)", () => {
    // E2e: exportTuning.parquet runs the real handler → MinIO. Parquet magic is
    // ASCII, so it survives the string download at both ends of the body.
    const PARQUET_MAGIC = "PAR1";

    it("exports valid .parquet files for all tables, ignoring compressed, and survives an adversarial trace name", async () => {
      const { projectId } = await createOrgProjectAndApiKey();
      s3Prefix = projectId;
      const now = new Date();
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
      const dataTime = now.getTime() - 90 * 60 * 1000;
      const traceId = randomUUID();
      const adversarialTraceId = randomUUID();
      const observationId = randomUUID();
      const scoreId = randomUUID();
      const eventId = randomUUID();

      await prisma.blobStorageIntegration.create({
        data: {
          projectId,
          type: BlobStorageIntegrationType.S3,
          bucketName,
          prefix: s3Prefix,
          accessKeyId: minioAccessKeyId,
          secretAccessKey: encrypt(minioAccessKeySecret),
          region: region ? region : "auto",
          endpoint: minioEndpoint,
          forcePathStyle:
            env.LANGFUSE_S3_EVENT_UPLOAD_FORCE_PATH_STYLE === "true",
          enabled: true,
          exportFrequency: "hourly",
          exportSource: "TRACES_OBSERVATIONS_EVENTS",
          nextSyncAt: twoHoursAgo,
          lastSyncAt: twoHoursAgo,
          // compressed must be ignored on the parquet path (no .gz suffix).
          compressed: true,
          fileType: BlobStorageIntegrationFileType.JSONL,
          exportTuning: { parquet: true },
        },
      });

      await Promise.all([
        createTracesCh([
          createTrace({
            id: traceId,
            project_id: projectId,
            timestamp: dataTime,
            name: "Parquet Trace",
          }),
          // Name starting with the exception marker lands in the uncompressed
          // footer min-stat; the per-query-tag scan must not false-positive
          // (footer-DoS regression — export must still succeed).
          createTrace({
            id: adversarialTraceId,
            project_id: projectId,
            timestamp: dataTime,
            name: "\r\n__exception__\r\n adversarial",
          }),
        ]),
        createObservationsCh([
          createObservation({
            id: observationId,
            trace_id: traceId,
            project_id: projectId,
            start_time: dataTime,
            end_time: dataTime + 5000,
            name: "Parquet Observation",
          }),
        ]),
        createScoresCh([
          createTraceScore({
            id: scoreId,
            trace_id: traceId,
            project_id: projectId,
            timestamp: dataTime,
            name: "Parquet Score",
            value: 0.5,
          }),
        ]),
        createEventsCh([
          createEvent({
            id: eventId,
            project_id: projectId,
            trace_id: traceId,
            type: "GENERATION",
            name: "Parquet Event",
            start_time: dataTime * 1000,
            end_time: (dataTime + 5000) * 1000,
          }),
        ]),
      ]);

      await handleBlobStorageIntegrationProjectJob({
        data: { payload: { projectId } },
      } as Job);

      const files = await s3StorageService.listFiles(s3Prefix);
      const projectFiles = files.filter((f) => f.file.includes(projectId));

      // traces, observations, scores, observations_v2 (events).
      expect(projectFiles).toHaveLength(4);
      for (const f of projectFiles) {
        expect(f.file.endsWith(".parquet")).toBe(true);
        expect(f.file).not.toContain(".gz");
      }

      // Every object is a valid Parquet file (magic at both ends).
      for (const f of projectFiles) {
        const content = await s3StorageService.download(f.file);
        expect(content.startsWith(PARQUET_MAGIC)).toBe(true);
        expect(content.endsWith(PARQUET_MAGIC)).toBe(true);
      }
    }, 30_000);
  });
});
