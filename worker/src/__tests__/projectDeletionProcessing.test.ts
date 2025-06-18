import { expect, it, describe, beforeAll } from "vitest";
import { env } from "../env";
import { randomUUID } from "crypto";
import {
  convertDateToClickhouseDateTime,
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
  upsertTrace,
} from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";
import { Job } from "bullmq";
import { projectDeleteProcessor } from "../queues/projectDelete";

describe("ProjectDeletionProcessingJob", () => {
  let storageService: StorageService;
  const orgId = "seed-org-id";

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

  it("should delete the project record after processing has completed", async () => {
    // Setup
    const projectId = randomUUID();
    await prisma.project.create({
      data: {
        id: projectId,
        orgId,
        name: `Project-${randomUUID()}`,
      },
    });

    // When
    await projectDeleteProcessor({
      data: { payload: { projectId, orgId } },
    } as Job);

    // Then
    const projects = await prisma.project.findMany({
      where: {
        id: projectId,
      },
    });
    expect(projects).toHaveLength(0);
  });

  it("should delete related table data via Prisma dependencies", async () => {
    // Setup
    const projectId = randomUUID();
    await prisma.project.create({
      data: {
        id: projectId,
        orgId,
        name: `Project-${randomUUID()}`,
      },
    });
    // Create a dummy dataset for the projectId
    await prisma.dataset.create({
      data: {
        id: randomUUID(),
        projectId,
        name: "Dataset",
      },
    });

    // When
    await projectDeleteProcessor({
      data: { payload: { projectId, orgId } },
    } as Job);

    // Then
    const datasets = await prisma.dataset.findMany({
      where: {
        projectId,
      },
    });
    expect(datasets).toHaveLength(0);
  });

  it("should delete clickhouse event data on project delete", async () => {
    // Setup
    const projectId = randomUUID();
    await prisma.project.create({
      data: {
        id: projectId,
        orgId,
        name: `Project-${randomUUID()}`,
      },
    });

    const baseId = randomUUID();
    await Promise.all([
      createTracesCh([
        createTrace({
          id: `${baseId}-trace`,
          project_id: projectId,
        }),
      ]),
      createObservationsCh([
        createObservation({
          id: `${baseId}-observation`,
          trace_id: `${baseId}-trace`,
          project_id: projectId,
        }),
      ]),
      createScoresCh([
        createTraceScore({
          id: `${baseId}-score`,
          trace_id: `${baseId}-trace`,
          project_id: projectId,
        }),
      ]),
    ]);

    // When
    await projectDeleteProcessor({
      data: { payload: { projectId, orgId } },
    } as Job);

    // Then
    const trace = await getTraceById({
      traceId: `${baseId}-trace`,
      projectId,
    });
    expect(trace).toBeUndefined();
    expect(() =>
      getObservationById({ id: `${baseId}-observation`, projectId }),
    ).rejects.toThrowError("not found");
    const score = await getScoreById({
      projectId,
      scoreId: `${baseId}-score`,
    });
    expect(score).toBeUndefined();
  });

  it("should delete event data from S3 for the project", async () => {
    // Setup
    const projectId = randomUUID();
    await prisma.project.create({
      data: {
        id: projectId,
        orgId,
        name: `Project-${randomUUID()}`,
      },
    });

    // Use upsertTrace here as this also creates an S3 event record
    const baseId = randomUUID();
    await upsertTrace({
      id: `${baseId}-trace`,
      project_id: projectId,
      timestamp: convertDateToClickhouseDateTime(new Date()),
      created_at: convertDateToClickhouseDateTime(new Date()),
      updated_at: convertDateToClickhouseDateTime(new Date()),
    });

    // When
    await projectDeleteProcessor({
      data: { payload: { projectId, orgId } },
    } as Job);

    // Then
    const files = await storageService.listFiles("");
    expect(files.some((file) => file.file.includes(`${baseId}-trace`))).toBe(
      false,
    );

    const eventLogRecord = await getBlobStorageByProjectAndEntityId(
      projectId,
      "trace",
      `${baseId}-trace`,
    );
    expect(eventLogRecord).toHaveLength(0);
  });

  it("should delete all media assets for the project", async () => {
    // Setup
    const projectId = randomUUID();
    await prisma.project.create({
      data: {
        id: projectId,
        orgId,
        name: `Project-${randomUUID()}`,
      },
    });

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
        createdAt: new Date(),
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
    await projectDeleteProcessor({
      data: { payload: { projectId, orgId } },
    } as Job);

    // Then
    const files = await storageService.listFiles("");
    expect(files.map((file) => file.file)).not.toContain(fileName);

    const media = await prisma.media.findUnique({
      where: { projectId_id: { id: mediaId, projectId } },
    });
    expect(media).toBeNull();

    const traceMedia = await prisma.traceMedia.findFirst({
      where: { mediaId },
    });
    expect(traceMedia).toBeNull();
  });
});
