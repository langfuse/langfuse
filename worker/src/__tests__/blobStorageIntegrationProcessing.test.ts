import { expect, it, describe, beforeAll } from "vitest";
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

describe("BlobStorageIntegrationProcessingJob", () => {
  let storageService: StorageService;
  const bucketName = env.LANGFUSE_S3_EVENT_UPLOAD_BUCKET || "";
  const accessKeyId = env.LANGFUSE_S3_EVENT_UPLOAD_ACCESS_KEY_ID || "";
  const secretAccessKey = env.LANGFUSE_S3_EVENT_UPLOAD_SECRET_ACCESS_KEY || "";
  const endpoint = env.LANGFUSE_S3_EVENT_UPLOAD_ENDPOINT || undefined;
  const region = env.LANGFUSE_S3_EVENT_UPLOAD_REGION || undefined;

  beforeAll(async () => {
    storageService = StorageServiceFactory.getInstance({
      accessKeyId,
      secretAccessKey,
      bucketName,
      endpoint,
      region,
      forcePathStyle: env.LANGFUSE_S3_EVENT_UPLOAD_FORCE_PATH_STYLE === "true",
    });
  });

  it("should not process when blob storage integration is disabled", async () => {
    const { projectId } = await createOrgProjectAndApiKey();

    // Setup an integration but disabled
    await prisma.blobStorageIntegration.create({
      data: {
        projectId,
        type: BlobStorageIntegrationType.S3,
        bucketName,
        prefix: "",
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
    const files = await storageService.listFiles("");
    expect(files.filter((f) => f.file.includes(projectId))).toHaveLength(0);
  });

  it("should export traces, generations, and scores to S3", async () => {
    // Setup
    const { projectId } = await createOrgProjectAndApiKey();
    const now = new Date();
    const threeHourAgo = new Date(now.getTime() - 3 * 60 * 60 * 1000);

    // Create integration
    await prisma.blobStorageIntegration.create({
      data: {
        projectId,
        type: BlobStorageIntegrationType.S3,
        bucketName,
        prefix: "",
        accessKeyId,
        secretAccessKey: encrypt(secretAccessKey),
        region: region ? region : "auto",
        endpoint: endpoint ? endpoint : null,
        forcePathStyle:
          env.LANGFUSE_S3_EVENT_UPLOAD_FORCE_PATH_STYLE === "true",
        enabled: true,
        exportFrequency: "hourly",
        nextSyncAt: threeHourAgo,
        lastSyncAt: threeHourAgo,
      },
    });

    // Create test data
    const traceId = randomUUID();
    const observationId = randomUUID();
    const scoreId = randomUUID();

    // Create trace, observation, and score in Clickhouse
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
    ]);

    // When
    await handleBlobStorageIntegrationProjectJob({
      data: { payload: { projectId } },
    } as Job);

    // Then
    const files = await storageService.listFiles("");
    const projectFiles = files.filter((f) => f.file.includes(projectId));

    // Should have 3 files (traces, observations, scores)
    expect(projectFiles).toHaveLength(3);

    // Check file paths follow the expected pattern
    const traceFile = projectFiles.find((f) => f.file.includes("/traces/"));
    const observationFile = projectFiles.find((f) =>
      f.file.includes("/observations/"),
    );
    const scoreFile = projectFiles.find((f) => f.file.includes("/scores/"));

    expect(traceFile).toBeDefined();
    expect(observationFile).toBeDefined();
    expect(scoreFile).toBeDefined();

    // Check file contents
    if (traceFile) {
      const content = await storageService.download(traceFile.file);
      expect(content).toContain(traceId);
      expect(content).toContain("Test Trace");
    }

    if (observationFile) {
      const content = await storageService.download(observationFile.file);
      expect(content).toContain(observationId);
      expect(content).toContain("Test Observation");
    }

    if (scoreFile) {
      const content = await storageService.download(scoreFile.file);
      expect(content).toContain(scoreId);
      expect(content).toContain("Test Score");
      expect(content).toContain("0.95");
    }

    // Check integration lastSyncAt and nextSyncAt are updated
    const updatedIntegration = await prisma.blobStorageIntegration.findUnique({
      where: { projectId },
    });

    if (updatedIntegration?.lastSyncAt && updatedIntegration?.nextSyncAt) {
      expect(updatedIntegration.lastSyncAt.getTime()).toBeGreaterThan(
        threeHourAgo.getTime(),
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
        accessKeyId,
        secretAccessKey: encrypt(secretAccessKey),
        region: region,
        endpoint: endpoint,
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
    const updatedIntegration = await prisma.blobStorageIntegration.findUnique({
      where: { projectId },
    });

    // Should be set to 7 days in the future from maxTimestamp (now - 30min)
    const expectedNextSync = new Date(
      now.getTime() - 30 * 60 * 1000 + 7 * 24 * 60 * 60 * 1000,
    );

    if (updatedIntegration?.nextSyncAt) {
      // Use a tolerance value in milliseconds instead of numeric precision
      const tolerance = 1000; // 1 second tolerance
      expect(
        Math.abs(
          updatedIntegration.nextSyncAt.getTime() - expectedNextSync.getTime(),
        ),
      ).toBeLessThan(tolerance);
    } else {
      expect.fail("Integration should have nextSyncAt set");
    }
  });

  it("should use prefix in file path when specified", async () => {
    // Setup
    const { projectId } = await createOrgProjectAndApiKey();
    const prefix = "test-prefix";
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    await prisma.blobStorageIntegration.create({
      data: {
        projectId,
        type: BlobStorageIntegrationType.S3,
        bucketName,
        prefix,
        accessKeyId,
        secretAccessKey: encrypt(secretAccessKey),
        region: region ? region : "auto",
        endpoint: endpoint ? endpoint : null,
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
    const files = await storageService.listFiles("");
    const projectFiles = files.filter((f) => f.file.includes(projectId));

    // All files should have the prefix
    expect(projectFiles.every((f) => f.file.startsWith(prefix))).toBe(true);
  });

  it("should handle CSV, JSON, and JSONL file types correctly", async () => {
    // Setup
    const { projectId } = await createOrgProjectAndApiKey();
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    // Create test data
    const traceId = randomUUID();
    const observationId = randomUUID();
    const scoreId = randomUUID();

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
    ]);

    // Test each file type
    for (const fileType of [
      BlobStorageIntegrationFileType.CSV,
      BlobStorageIntegrationFileType.JSON,
      BlobStorageIntegrationFileType.JSONL,
    ]) {
      // Create integration with specific file type
      await prisma.blobStorageIntegration.upsert({
        where: { projectId },
        update: {
          prefix: `${fileType.toLowerCase()}-test/`,
          fileType,
          lastSyncAt: oneHourAgo,
        },
        create: {
          projectId,
          type: BlobStorageIntegrationType.S3,
          bucketName,
          prefix: `${fileType.toLowerCase()}-test/`,
          accessKeyId,
          secretAccessKey: encrypt(secretAccessKey),
          region: region ? region : "auto",
          endpoint: endpoint ? endpoint : null,
          forcePathStyle:
            env.LANGFUSE_S3_EVENT_UPLOAD_FORCE_PATH_STYLE === "true",
          enabled: true,
          exportFrequency: "hourly",
          fileType,
          lastSyncAt: oneHourAgo,
        },
      });

      // Process the integration
      await handleBlobStorageIntegrationProjectJob({
        data: { payload: { projectId } },
      } as Job);

      // Get files for this file type
      const files = await storageService.listFiles("");
      const projectFiles = files.filter(
        (f) =>
          f.file.includes(projectId) &&
          f.file.includes(`${fileType.toLowerCase()}-test/`),
      );

      // Should have 3 files (traces, observations, scores)
      expect(projectFiles).toHaveLength(3);

      // Check file extensions
      const expectedExtension = fileType.toLowerCase();
      expect(
        projectFiles.every((f) => f.file.endsWith(`.${expectedExtension}`)),
      ).toBe(true);

      // Check file contents for each type
      for (const file of projectFiles) {
        const content = await storageService.download(file.file);

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
