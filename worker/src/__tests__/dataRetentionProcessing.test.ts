import { expect, it, describe, beforeAll, beforeEach, afterEach } from "vitest";
import { env } from "../env";
import { randomUUID } from "crypto";
import {
  clickhouseClient,
  createObservation,
  createObservationsCh,
  createTraceScore,
  createScoresCh,
  createTrace,
  createTracesCh,
  getBlobStorageByProjectAndEntityId,
  getObservationById,
  getScoreById,
  getTraceById,
  StorageService,
  StorageServiceFactory,
  toClickhouseDateTime,
} from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";
import { handleDataRetentionProcessingJob } from "../ee/dataRetention/handleDataRetentionProcessingJob";
import { Job } from "bullmq";
import { appendRunEvents } from "@langfuse/shared/in-app-agent/server/persistence";
import { InAppAgentRunStatus } from "@langfuse/shared/in-app-agent";
import { EventType } from "@ag-ui/core";
import { createAndAddApiKeysToDb } from "@langfuse/shared/src/server/auth/apiKeys";

describe("DataRetentionProcessingJob", () => {
  let storageService: StorageService;
  let s3Prefix: string | null = null;
  const projectId = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";

  beforeAll(() => {
    storageService = StorageServiceFactory.getInstance({
      accessKeyId: env.LANGFUSE_S3_MEDIA_UPLOAD_ACCESS_KEY_ID,
      secretAccessKey: env.LANGFUSE_S3_MEDIA_UPLOAD_SECRET_ACCESS_KEY,
      bucketName: String(env.LANGFUSE_S3_MEDIA_UPLOAD_BUCKET),
      endpoint: env.LANGFUSE_S3_MEDIA_UPLOAD_ENDPOINT,
      region: env.LANGFUSE_S3_MEDIA_UPLOAD_REGION,
      forcePathStyle: env.LANGFUSE_S3_MEDIA_UPLOAD_FORCE_PATH_STYLE === "true",
    });
  });

  beforeEach(() => {
    s3Prefix = `${randomUUID()}/`;
  });

  afterEach(async () => {
    // Clean up all files created during this test
    if (!s3Prefix) return;

    const files = await storageService.listFiles(s3Prefix);

    if (files.length == 0) return;

    await storageService.deleteFiles(files.map((f) => f.file));
    s3Prefix = null;
  });

  it("prunes expired events while keeping conversations, recent events and active runs", async () => {
    const expiredAt = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const recentAt = new Date();
    const expiredId = randomUUID();
    const recentId = randomUUID();
    const runningId = randomUUID();
    const staleId = randomUUID();
    const eventlessStaleId = randomUUID();
    const legacyId = randomUUID();
    const expiredKeyRunId = randomUUID();
    const keyIds: string[] = [];
    const ids = [
      expiredId,
      recentId,
      runningId,
      staleId,
      eventlessStaleId,
      legacyId,
    ];

    await prisma.project.update({
      where: { id: projectId },
      data: { retentionDays: 7 },
    });

    try {
      const staleKey = await createAndAddApiKeysToDb({
        prisma,
        entityId: projectId,
        scope: "PROJECT",
        isInAppAgentKey: true,
      });
      const expiredKey = await createAndAddApiKeysToDb({
        prisma,
        entityId: projectId,
        scope: "PROJECT",
        isInAppAgentKey: true,
      });
      keyIds.push(staleKey.id, expiredKey.id);
      await prisma.inAppAgentConversation.createMany({
        data: [
          {
            id: expiredId,
            projectId,
            createdAt: expiredAt,
            updatedAt: expiredAt,
          },
          {
            id: recentId,
            projectId,
            createdAt: expiredAt,
            updatedAt: recentAt,
          },
          {
            id: runningId,
            projectId,
            createdAt: expiredAt,
            updatedAt: expiredAt,
          },
          { id: staleId, projectId, createdAt: expiredAt },
          { id: eventlessStaleId, projectId, createdAt: expiredAt },
          { id: legacyId, projectId, createdAt: expiredAt },
        ],
      });
      const expiredRunId = randomUUID();
      const runningRunId = randomUUID();
      const staleRunId = randomUUID();
      const eventlessStaleRunId = randomUUID();
      const legacyRunId = randomUUID();
      await prisma.inAppAgentRun.createMany({
        data: [
          {
            id: expiredRunId,
            projectId,
            conversationId: expiredId,
            finishedAt: expiredAt,
          },
          { id: runningRunId, projectId, conversationId: runningId },
          {
            id: staleRunId,
            projectId,
            conversationId: staleId,
            status: InAppAgentRunStatus.RUNNING,
            createdAt: expiredAt,
            claimedAt: expiredAt,
            heartbeatAt: expiredAt,
            mcpApiKeyId: staleKey.id,
          },
          {
            id: eventlessStaleRunId,
            projectId,
            conversationId: eventlessStaleId,
            status: InAppAgentRunStatus.RUNNING,
            createdAt: expiredAt,
            claimedAt: expiredAt,
            heartbeatAt: expiredAt,
            request: { message: "expired" },
          },
          {
            id: legacyRunId,
            projectId,
            conversationId: legacyId,
            status: null,
            createdAt: expiredAt,
            request: { message: "expired legacy request" },
          },
          {
            id: expiredKeyRunId,
            projectId,
            conversationId: expiredId,
            createdAt: expiredAt,
            finishedAt: expiredAt,
            mcpApiKeyId: expiredKey.id,
          },
        ],
      });
      await prisma.inAppAgentEvent.create({
        data: {
          projectId,
          conversationId: expiredId,
          runId: expiredRunId,
          sequenceNumber: 1,
          type: "test",
          event: {},
        },
      });
      await prisma.inAppAgentEvent.create({
        data: {
          projectId,
          conversationId: expiredId,
          runId: expiredRunId,
          sequenceNumber: 2,
          type: "test",
          event: {},
        },
      });
      await prisma.inAppAgentEvent.update({
        where: {
          projectId_conversationId_sequenceNumber: {
            projectId,
            conversationId: expiredId,
            sequenceNumber: 1,
          },
        },
        data: { createdAt: expiredAt },
      });
      await prisma.inAppAgentEvent.create({
        data: {
          projectId,
          conversationId: runningId,
          runId: runningRunId,
          sequenceNumber: 0,
          type: "test",
          event: {},
          createdAt: expiredAt,
        },
      });
      await prisma.inAppAgentEvent.create({
        data: {
          projectId,
          conversationId: staleId,
          runId: staleRunId,
          sequenceNumber: 4,
          type: "test",
          event: {},
          createdAt: expiredAt,
        },
      });
      await prisma.inAppAgentEvent.create({
        data: {
          projectId,
          conversationId: legacyId,
          runId: legacyRunId,
          sequenceNumber: 3,
          type: "test",
          event: {},
          createdAt: expiredAt,
        },
      });

      await handleDataRetentionProcessingJob({
        data: { payload: { projectId, retention: 7 } },
      } as Job);

      const conversations = await prisma.inAppAgentConversation.findMany({
        where: { projectId, id: { in: ids } },
      });
      expect(
        conversations.map((conversation) => conversation.id).sort(),
      ).toEqual(ids.sort());
      expect(
        conversations.find((conversation) => conversation.id === expiredId)
          ?.historyPrunedAt,
      ).not.toBeNull();
      expect(
        await prisma.inAppAgentRun.count({
          where: { projectId, conversationId: expiredId },
        }),
      ).toBe(1);
      expect(
        await prisma.inAppAgentEvent.count({
          where: { projectId, conversationId: runningId },
        }),
      ).toBe(1);
      expect(
        await prisma.inAppAgentEvent.count({
          where: { projectId, conversationId: expiredId },
        }),
      ).toBe(1);
      expect(
        await prisma.inAppAgentEvent.findFirst({
          where: { projectId, conversationId: expiredId },
          select: { sequenceNumber: true },
        }),
      ).toMatchObject({ sequenceNumber: 2 });
      expect(
        await prisma.inAppAgentRun.findUnique({
          where: { id_projectId: { id: staleRunId, projectId } },
        }),
      ).toMatchObject({ status: InAppAgentRunStatus.FAILED });
      expect(
        await prisma.inAppAgentEvent.count({
          where: { projectId, conversationId: staleId },
        }),
      ).toBe(0);
      expect(
        await prisma.inAppAgentConversation.findUnique({
          where: { id_projectId: { id: staleId, projectId } },
        }),
      ).toMatchObject({ prunedEventCursor: 4 });
      expect(
        await prisma.inAppAgentRun.findUnique({
          where: { id_projectId: { id: eventlessStaleRunId, projectId } },
        }),
      ).toMatchObject({ status: InAppAgentRunStatus.FAILED, request: null });
      expect(
        await prisma.inAppAgentRun.findUnique({
          where: { id_projectId: { id: legacyRunId, projectId } },
        }),
      ).toMatchObject({ status: InAppAgentRunStatus.FAILED, request: null });
      expect(
        await prisma.inAppAgentEvent.count({
          where: { projectId, conversationId: legacyId },
        }),
      ).toBe(0);
      expect(
        await prisma.inAppAgentConversation.findUnique({
          where: { id_projectId: { id: legacyId, projectId } },
        }),
      ).toMatchObject({ prunedEventCursor: 3 });
      expect(await prisma.apiKey.count({ where: { id: { in: keyIds } } })).toBe(
        0,
      );
      expect(
        await prisma.inAppAgentRun.findUnique({
          where: { id_projectId: { id: expiredKeyRunId, projectId } },
        }),
      ).toBeNull();
      expect(
        await prisma.inAppAgentRun.findUnique({
          where: { id_projectId: { id: staleRunId, projectId } },
        }),
      ).toMatchObject({ mcpApiKeyId: null });

      const nextRunId = randomUUID();
      await prisma.inAppAgentRun.create({
        data: {
          id: nextRunId,
          projectId,
          conversationId: staleId,
          status: InAppAgentRunStatus.RUNNING,
        },
      });
      expect(
        await appendRunEvents({
          prisma,
          projectId,
          conversationId: staleId,
          runId: nextRunId,
          events: [
            {
              type: EventType.RUN_FINISHED,
              threadId: staleId,
              runId: nextRunId,
            },
          ],
        }),
      ).toBe(true);
      expect(
        await prisma.inAppAgentEvent.findFirst({
          where: { projectId, conversationId: staleId },
          select: { sequenceNumber: true },
        }),
      ).toMatchObject({ sequenceNumber: 5 });
    } finally {
      await prisma.inAppAgentConversation.deleteMany({
        where: { projectId, id: { in: ids } },
      });
      await prisma.apiKey.deleteMany({ where: { id: { in: keyIds } } });
      await prisma.project.update({
        where: { id: projectId },
        data: { retentionDays: null },
      });
    }
  });

  it("retains assistant conversations when retention is disabled after the job was queued", async () => {
    const id = randomUUID();
    await prisma.project.update({
      where: { id: projectId },
      data: { retentionDays: null },
    });

    try {
      await prisma.inAppAgentConversation.create({
        data: {
          id,
          projectId,
          createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        },
      });

      await handleDataRetentionProcessingJob({
        data: { payload: { projectId, retention: 7 } },
      } as Job);

      expect(
        await prisma.inAppAgentConversation.findUnique({
          where: { id_projectId: { id, projectId } },
        }),
      ).not.toBeNull();
    } finally {
      await prisma.inAppAgentConversation.deleteMany({
        where: { id, projectId },
      });
    }
  });

  it("should NOT delete event files from cloud storage if after expiry cutoff", async () => {
    // Setup: Set retention in database to match job payload
    await prisma.project.update({
      where: { id: projectId },
      data: { retentionDays: 7 },
    });

    const baseId = randomUUID();
    const fileName = `${s3Prefix}${baseId}.json`;
    const fileType = "application/json";
    const data = JSON.stringify({ hello: "world" });

    await storageService.uploadFile({
      fileName,
      fileType,
      data,
    });

    await clickhouseClient().insert({
      table: "blob_storage_file_log",
      format: "JSONEachRow",
      values: [
        {
          id: randomUUID(),
          project_id: projectId,
          entity_type: "trace",
          entity_id: `${baseId}-trace`,
          event_id: randomUUID(),
          bucket_name: env.LANGFUSE_S3_EVENT_UPLOAD_BUCKET,
          bucket_path: fileName,
          created_at: toClickhouseDateTime(
            Date.now() - 1000 * 60 * 60 * 24 * 3,
          ), // 3 days in the past
          updated_at: toClickhouseDateTime(
            Date.now() - 1000 * 60 * 60 * 24 * 3,
          ), // 3 days in the past
        },
      ],
    });

    // When
    await handleDataRetentionProcessingJob({
      data: { payload: { projectId, retention: 7 } }, // Delete after 7 days
    } as Job);

    // Then
    const files = await storageService.listFiles(s3Prefix);
    expect(files.map((file) => file.file)).toContain(fileName);

    const eventLogRecord = await getBlobStorageByProjectAndEntityId(
      projectId,
      "trace",
      `${baseId}-trace`,
    );
    expect(eventLogRecord).toHaveLength(1);

    // Cleanup
    await prisma.project.update({
      where: { id: projectId },
      data: { retentionDays: null },
    });
  });

  it("should delete event files from cloud storage if expired", async () => {
    // Setup: Set retention in database to match job payload
    await prisma.project.update({
      where: { id: projectId },
      data: { retentionDays: 7 },
    });

    const baseId = randomUUID();
    const fileName = `${s3Prefix}${baseId}.json`;
    const fileType = "application/json";
    const data = JSON.stringify({ hello: "world" });

    await storageService.uploadFile({
      fileName,
      fileType,
      data,
    });

    await clickhouseClient().insert({
      table: "blob_storage_file_log",
      format: "JSONEachRow",
      values: [
        {
          id: randomUUID(),
          project_id: projectId,
          entity_type: "trace",
          entity_id: `${baseId}-trace`,
          event_id: randomUUID(),
          bucket_name: env.LANGFUSE_S3_EVENT_UPLOAD_BUCKET,
          bucket_path: fileName,
          created_at: toClickhouseDateTime(
            Date.now() - 1000 * 60 * 60 * 24 * 30,
          ), // 30 days in the past
          updated_at: toClickhouseDateTime(
            Date.now() - 1000 * 60 * 60 * 24 * 30,
          ), // 30 days in the past
        },
      ],
    });

    // When
    await handleDataRetentionProcessingJob({
      data: { payload: { projectId, retention: 7 } }, // Delete after 7 days
    } as Job);

    // Then
    const files = await storageService.listFiles(s3Prefix);
    expect(files.map((file) => file.file)).not.toContain(fileName);

    const eventLogRecord = await getBlobStorageByProjectAndEntityId(
      projectId,
      "trace",
      `${baseId}-trace`,
    );
    expect(eventLogRecord).toHaveLength(0);

    // Cleanup
    await prisma.project.update({
      where: { id: projectId },
      data: { retentionDays: null },
    });
  });

  it("should NOT delete media files from cloud storage and database if after expiry cutoff", async () => {
    // Setup: Set retention in database to match job payload
    await prisma.project.update({
      where: { id: projectId },
      data: { retentionDays: 7 },
    });

    const fileName = `${s3Prefix}${randomUUID()}.txt`;
    const fileType = "text/plain";
    const data = "Hello, world!";

    await storageService.uploadFile({
      fileName,
      fileType,
      data,
    });

    const mediaId = randomUUID();
    const traceId = randomUUID();
    await prisma.media.create({
      data: {
        id: mediaId,
        sha256Hash: randomUUID(),
        projectId,
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3), // 3 days in the past
        bucketPath: fileName,
        bucketName: String(env.LANGFUSE_S3_MEDIA_UPLOAD_BUCKET),
        contentType: fileType,
        contentLength: 0,
      },
    });

    await prisma.traceMedia.create({
      data: {
        id: randomUUID(),
        projectId,
        traceId,
        mediaId,
        field: "test",
      },
    });

    // When
    await handleDataRetentionProcessingJob({
      data: { payload: { projectId, retention: 7 } }, // Delete after 7 days
    } as Job);

    // Then
    const files = await storageService.listFiles(s3Prefix);
    expect(files.map((file) => file.file)).toContain(fileName);

    const media = await prisma.media.findUnique({
      where: { projectId_id: { projectId, id: mediaId } },
    });
    expect(media).toBeDefined();

    const traceMedia = await prisma.traceMedia.findFirst({
      where: { mediaId },
    });
    expect(traceMedia).toBeDefined();

    // Cleanup
    await prisma.project.update({
      where: { id: projectId },
      data: { retentionDays: null },
    });
  });

  it("should delete media files from cloud storage and database if expired", async () => {
    // Setup: Set retention in database to match job payload
    await prisma.project.update({
      where: { id: projectId },
      data: { retentionDays: 7 },
    });

    const fileName = `${s3Prefix}${randomUUID()}.txt`;
    const fileType = "text/plain";
    const data = "Hello, world!";

    await storageService.uploadFile({
      fileName,
      fileType,
      data,
    });

    const mediaId = randomUUID();
    const traceId = randomUUID();
    await prisma.media.create({
      data: {
        id: mediaId,
        sha256Hash: randomUUID(),
        projectId,
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30), // 30 days in the past
        bucketPath: fileName,
        bucketName: String(env.LANGFUSE_S3_MEDIA_UPLOAD_BUCKET),
        contentType: fileType,
        contentLength: 0,
      },
    });

    await prisma.traceMedia.create({
      data: {
        id: randomUUID(),
        projectId,
        traceId,
        mediaId,
        field: "test",
      },
    });

    // When
    await handleDataRetentionProcessingJob({
      data: { payload: { projectId, retention: 7 } }, // Delete after 7 days
    } as Job);

    // Then
    const files = await storageService.listFiles(s3Prefix);
    expect(files.map((file) => file.file)).not.toContain(fileName);

    const media = await prisma.media.findUnique({
      where: { projectId_id: { projectId, id: mediaId } },
    });
    expect(media).toBeNull();

    const traceMedia = await prisma.traceMedia.findFirst({
      where: { mediaId },
    });
    expect(traceMedia).toBeNull();

    // Cleanup
    await prisma.project.update({
      where: { id: projectId },
      data: { retentionDays: null },
    });
  });

  it("should delete traces older than retention days", async () => {
    // Setup: Set retention in database to match job payload
    await prisma.project.update({
      where: { id: projectId },
      data: { retentionDays: 7 },
    });

    const baseId = randomUUID();
    await createTracesCh([
      createTrace({
        id: `${baseId}-trace-old`,
        project_id: projectId,
        timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).getTime(), // 30 days in the past
      }),
      createTrace({
        id: `${baseId}-trace-new`,
        project_id: projectId,
      }),
    ]);

    // When
    await handleDataRetentionProcessingJob({
      data: { payload: { projectId, retention: 7 } }, // Delete after 7 days
    } as Job);

    // Then
    const traceOld = await getTraceById({
      traceId: `${baseId}-trace-old`,
      projectId,
    });
    expect(traceOld).toBeUndefined();
    const traceNew = await getTraceById({
      traceId: `${baseId}-trace-new`,
      projectId,
    });
    expect(traceNew).toBeDefined();

    // Cleanup
    await prisma.project.update({
      where: { id: projectId },
      data: { retentionDays: null },
    });
  });

  it("should delete observations older than retention days", async () => {
    // Setup: Set retention in database to match job payload
    await prisma.project.update({
      where: { id: projectId },
      data: { retentionDays: 7 },
    });

    const baseId = randomUUID();
    await createObservationsCh([
      createObservation({
        id: `${baseId}-observation-old`,
        project_id: projectId,
        start_time: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).getTime(), // 30 days in the past
      }),
      createObservation({
        id: `${baseId}-observation-new`,
        project_id: projectId,
      }),
    ]);

    // When
    await handleDataRetentionProcessingJob({
      data: { payload: { projectId, retention: 7 } }, // Delete after 7 days
    } as Job);

    // Then
    expect(() =>
      getObservationById({ id: `${baseId}-observation-old`, projectId }),
    ).rejects.toThrowError("not found");
    const observationNew = await getObservationById({
      id: `${baseId}-observation-new`,
      projectId,
    });
    expect(observationNew).toBeDefined();

    // Cleanup
    await prisma.project.update({
      where: { id: projectId },
      data: { retentionDays: null },
    });
  });

  it("should delete scores older than retention days", async () => {
    // Setup: Set retention in database to match job payload
    await prisma.project.update({
      where: { id: projectId },
      data: { retentionDays: 7 },
    });

    const baseId = randomUUID();
    await createScoresCh([
      createTraceScore({
        id: `${baseId}-score-old`,
        project_id: projectId,
        timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).getTime(), // 30 days in the past
      }),
      createTraceScore({
        id: `${baseId}-score-new`,
        project_id: projectId,
      }),
    ]);

    // When
    await handleDataRetentionProcessingJob({
      data: { payload: { projectId, retention: 7 } }, // Delete after 7 days
    } as Job);

    // Then
    const scoresOld = await getScoreById({
      projectId,
      scoreId: `${baseId}-score-old`,
    });
    expect(scoresOld).toBeUndefined();
    const scoresNew = await getScoreById({
      projectId,
      scoreId: `${baseId}-score-new`,
    });
    expect(scoresNew).toBeDefined();

    // Cleanup
    await prisma.project.update({
      where: { id: projectId },
      data: { retentionDays: null },
    });
  });

  it("should skip deletion when retention is changed to 0 (indefinite) after job was queued", async () => {
    // Setup: Create data that would be deleted if retention was still 7 days
    const baseId = randomUUID();
    await createTracesCh([
      createTrace({
        id: `${baseId}-trace-old`,
        project_id: projectId,
        timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).getTime(), // 30 days in the past
      }),
    ]);

    // Simulate that project retention was changed to 0 (indefinite)
    await prisma.project.update({
      where: { id: projectId },
      data: { retentionDays: 0 },
    });

    // When: Process job that was queued with retention: 7
    await handleDataRetentionProcessingJob({
      data: { payload: { projectId, retention: 7 } }, // Job queued with 7 day retention
    } as Job);

    // Then: Data should NOT be deleted because current retention is 0
    const traceOld = await getTraceById({
      traceId: `${baseId}-trace-old`,
      projectId,
    });
    expect(traceOld).toBeDefined();

    // Cleanup
    await prisma.project.update({
      where: { id: projectId },
      data: { retentionDays: null },
    });
  });

  it("should skip deletion when retention is changed to null after job was queued", async () => {
    // Setup: Create data that would be deleted if retention was still 7 days
    const baseId = randomUUID();
    await createTracesCh([
      createTrace({
        id: `${baseId}-trace-old-2`,
        project_id: projectId,
        timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).getTime(), // 30 days in the past
      }),
    ]);

    // Simulate that project retention was removed (null)
    await prisma.project.update({
      where: { id: projectId },
      data: { retentionDays: null },
    });

    // When: Process job that was queued with retention: 7
    await handleDataRetentionProcessingJob({
      data: { payload: { projectId, retention: 7 } }, // Job queued with 7 day retention
    } as Job);

    // Then: Data should NOT be deleted because current retention is null
    const traceOld = await getTraceById({
      traceId: `${baseId}-trace-old-2`,
      projectId,
    });
    expect(traceOld).toBeDefined();
  });

  it("should use current retention value if it changed from queued value", async () => {
    // Setup: Create data with different ages
    const baseId = randomUUID();
    await createTracesCh([
      createTrace({
        id: `${baseId}-trace-very-old`,
        project_id: projectId,
        timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 40).getTime(), // 40 days in the past
      }),
      createTrace({
        id: `${baseId}-trace-old`,
        project_id: projectId,
        timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 25).getTime(), // 25 days in the past
      }),
    ]);

    // Simulate that project retention was changed from 7 to 30 days
    await prisma.project.update({
      where: { id: projectId },
      data: { retentionDays: 30 },
    });

    // When: Process job that was queued with retention: 7
    await handleDataRetentionProcessingJob({
      data: { payload: { projectId, retention: 7 } }, // Job queued with 7 day retention
    } as Job);

    // Then: Should use current retention (30 days)
    // - Trace at 40 days should be deleted
    // - Trace at 25 days should remain
    const traceVeryOld = await getTraceById({
      traceId: `${baseId}-trace-very-old`,
      projectId,
    });
    expect(traceVeryOld).toBeUndefined();

    const traceOld = await getTraceById({
      traceId: `${baseId}-trace-old`,
      projectId,
    });
    expect(traceOld).toBeDefined();

    // Cleanup
    await prisma.project.update({
      where: { id: projectId },
      data: { retentionDays: null },
    });
  });
});
