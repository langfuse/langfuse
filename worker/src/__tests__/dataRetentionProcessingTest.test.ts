import { expect, it, describe, beforeAll } from "vitest";
import { env } from "../env";
import { randomUUID } from "crypto";
import {
  createObservation,
  createObservationsCh,
  createScore,
  createScoresCh,
  createTrace,
  createTracesCh,
  getObservationById,
  getScoreById,
  getTraceById,
  StorageService,
  StorageServiceFactory,
} from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";
import { handleDataRetentionProcessingJob } from "../ee/dataRetention/handleDataRetentionProcessingJob";
import { Job } from "bullmq";

describe("DataRetentionProcessingJob", () => {
  let storageService: StorageService;
  const projectId = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";

  beforeAll(() => {
    storageService = StorageServiceFactory.getInstance({
      accessKeyId: env.LANGFUSE_S3_MEDIA_UPLOAD_ACCESS_KEY_ID,
      secretAccessKey: env.LANGFUSE_S3_MEDIA_UPLOAD_SECRET_ACCESS_KEY,
      bucketName: env.LANGFUSE_S3_MEDIA_UPLOAD_BUCKET,
      endpoint: env.LANGFUSE_S3_MEDIA_UPLOAD_ENDPOINT,
      region: env.LANGFUSE_S3_MEDIA_UPLOAD_REGION,
      forcePathStyle: env.LANGFUSE_S3_MEDIA_UPLOAD_FORCE_PATH_STYLE === "true",
    });
  });

  it("should delete media files from cloud storage and database if expired", async () => {
    // Setup
    const fileName = `${randomUUID()}.txt`;
    const fileType = "text/plain";
    const data = "Hello, world!";
    const expiresInSeconds = 3600;
    await storageService.uploadFile({
      fileName,
      fileType,
      data,
      expiresInSeconds,
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
        bucketName: env.LANGFUSE_S3_MEDIA_UPLOAD_BUCKET,
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
    const files = await storageService.listFiles("");
    expect(files).not.toContain(fileName);

    const media = await prisma.media.findUnique({
      where: { id: mediaId },
    });
    expect(media).toBeNull();

    const traceMedia = await prisma.traceMedia.findFirst({
      where: { mediaId },
    });
    expect(traceMedia).toBeNull();
  });

  it("should delete traces older than retention days", async () => {
    // Setup
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
    const traceOld = await getTraceById(`${baseId}-trace-old`, projectId);
    expect(traceOld).toBeUndefined();
    const traceNew = await getTraceById(`${baseId}-trace-new`, projectId);
    expect(traceNew).toBeDefined();
  });

  it("should delete observations older than retention days", async () => {
    // Setup
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
      getObservationById(`${baseId}-observation-old`, projectId),
    ).rejects.toThrowError("not found");
    const observationNew = await getObservationById(
      `${baseId}-observation-new`,
      projectId,
    );
    expect(observationNew).toBeDefined();
  });

  it("should delete scores older than retention days", async () => {
    // Setup
    const baseId = randomUUID();
    await createScoresCh([
      createScore({
        id: `${baseId}-score-old`,
        project_id: projectId,
        timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).getTime(), // 30 days in the past
      }),
      createScore({
        id: `${baseId}-score-new`,
        project_id: projectId,
      }),
    ]);

    // When
    await handleDataRetentionProcessingJob({
      data: { payload: { projectId, retention: 7 } }, // Delete after 7 days
    } as Job);

    // Then
    const scoresOld = await getScoreById(projectId, `${baseId}-score-old`);
    expect(scoresOld).toBeUndefined();
    const scoresNew = await getScoreById(projectId, `${baseId}-score-new`);
    expect(scoresNew).toBeDefined();
  });
});
