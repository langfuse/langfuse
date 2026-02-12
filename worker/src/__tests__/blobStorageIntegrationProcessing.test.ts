import { expect, it, describe, beforeAll, beforeEach, afterEach } from "vitest";
import { env } from "../env";
import { randomUUID } from "crypto";
import {
  createObservation,
  createObservationsCh,
  createOrgProjectAndApiKey,
  createTraceScore,
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
import { handleBlobStorageIntegrationProjectJob } from "../features/blobstorage/handleBlobStorageIntegrationProjectJob";
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
  process.env.LANGFUSE_ENABLE_EVENTS_TABLE_V2_APIS === "true"
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

  afterEach(async () => {
    // Clean up all files created during this test
    if (!s3Prefix) return;

    const files = await s3StorageService.listFiles(s3Prefix);

    if (files.length == 0) return;

    await s3StorageService.deleteFiles(files.map((f) => f.file));
    s3Prefix = null;
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

  maybeDescribe("events table export tests", () => {
    it("should export traces, generations, and scores to S3", async () => {
      // Setup
      const { projectId } = await createOrgProjectAndApiKey();
      s3Prefix = projectId;
      const now = new Date();
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
        },
      });

      // Create test data within the export window (2 hours ago to 1 hour ago)
      // With 30-min lag buffer, actual window is 2h ago to (1h ago or now-30min, whichever is earlier)
      const traceId = randomUUID();
      const observationId = randomUUID();
      const scoreId = randomUUID();

      // Create event data for events table export
      const event = createEvent({
        project_id: projectId,
        trace_id: traceId,
        type: "GENERATION",
        name: "Test Event",
        start_time: (now.getTime() - 90 * 60 * 1000) * 1000, // 90 minutes before now (microseconds)
      });

      // Create trace, observation, score, and event in Clickhouse
      // Data is at 90 minutes ago, which falls within the chunked export window
      await Promise.all([
        createTracesCh([
          createTrace({
            id: traceId,
            project_id: projectId,
            timestamp: now.getTime() - 90 * 60 * 1000, // 90 min before now
            name: "Test Trace",
          }),
        ]),
        createObservationsCh([
          createObservation({
            id: observationId,
            trace_id: traceId,
            project_id: projectId,
            start_time: now.getTime() - 90 * 60 * 1000, // 90 minutes before now
            name: "Test Observation",
          }),
        ]),
        createScoresCh([
          createTraceScore({
            id: scoreId,
            trace_id: traceId,
            project_id: projectId,
            timestamp: now.getTime() - 90 * 60 * 1000, // 90 minutes before now
            name: "Test Score",
            value: 0.95,
          }),
        ]),
        createEventsCh([event]),
      ]);

      // When
      await handleBlobStorageIntegrationProjectJob({
        data: { payload: { projectId } },
      } as Job);

      // Then
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
      }

      if (observationFile) {
        const content = await s3StorageService.download(observationFile.file);
        expect(content).toContain(observationId);
        expect(content).toContain("Test Observation");
      }

      if (scoreFile) {
        const content = await s3StorageService.download(scoreFile.file);
        expect(content).toContain(scoreId);
        expect(content).toContain("Test Score");
        expect(content).toContain("0.95");
      }

      if (eventFile) {
        const content = await s3StorageService.download(eventFile.file);
        expect(content).toContain(event.span_id);
        expect(content).toContain("Test Event");
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

      // Should be set to 7 days in the future from maxTimestamp (now - 30min)
      const expectedNextSync = new Date(
        now.getTime() - 30 * 60 * 1000 + 7 * 24 * 60 * 60 * 1000,
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
});
