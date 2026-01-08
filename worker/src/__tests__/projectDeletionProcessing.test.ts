import { expect, it, describe, beforeAll, beforeEach, afterEach } from "vitest";
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
  deleteTracesByProjectId,
  deleteObservationsByProjectId,
  deleteScoresByProjectId,
  deleteEventsByProjectId,
  deleteTracesOlderThanDays,
  deleteObservationsOlderThanDays,
  deleteScoresOlderThanDays,
  deleteEventsOlderThanDays,
} from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";
import { Job } from "bullmq";
import { projectDeleteProcessor } from "../queues/projectDelete";

describe("ProjectDeletionProcessingJob", () => {
  let storageService: StorageService;
  let s3Prefix: string | null = null;
  const orgId = "seed-org-id";

  const maybeEventsIt =
    env.LANGFUSE_EXPERIMENT_INSERT_INTO_EVENTS_TABLE === "true" ? it : it.skip;

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

  afterEach(async () => {
    // Clean up all files created during this test
    if (!s3Prefix) return;

    const files = await storageService.listFiles(s3Prefix);

    if (files.length == 0) return;

    await storageService.deleteFiles(files.map((f) => f.file));
    s3Prefix = null;
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

  maybeEventsIt(
    "should delete event data from S3 for the project",
    async () => {
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
    },
  );

  it("should delete all media assets for the project", async () => {
    // Setup
    const projectId = randomUUID();
    s3Prefix = `${randomUUID()}/`;
    await prisma.project.create({
      data: {
        id: projectId,
        orgId,
        name: `Project-${randomUUID()}`,
      },
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
    const files = await storageService.listFiles(s3Prefix);
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

  describe("delete functions with hasAny probe", () => {
    it("should return false when no traces exist for project", async () => {
      const emptyProjectId = randomUUID();
      const result = await deleteTracesByProjectId(emptyProjectId);
      expect(result).toBe(false);
    });

    it("should return false when no observations exist for project", async () => {
      const emptyProjectId = randomUUID();
      const result = await deleteObservationsByProjectId(emptyProjectId);
      expect(result).toBe(false);
    });

    it("should return false when no scores exist for project", async () => {
      const emptyProjectId = randomUUID();
      const result = await deleteScoresByProjectId(emptyProjectId);
      expect(result).toBe(false);
    });

    maybeEventsIt(
      "should return false when no events exist for project",
      async () => {
        const emptyProjectId = randomUUID();
        const result = await deleteEventsByProjectId(emptyProjectId);
        expect(result).toBe(false);
      },
    );

    it("should return true and delete when traces exist", async () => {
      const projectId = randomUUID();
      const traceId = randomUUID();

      await createTracesCh([
        createTrace({ id: traceId, project_id: projectId }),
      ]);

      const traceBefore = await getTraceById({ traceId, projectId });
      expect(traceBefore).toBeDefined();

      const result = await deleteTracesByProjectId(projectId);
      expect(result).toBe(true);

      const traceAfter = await getTraceById({ traceId, projectId });
      expect(traceAfter).toBeUndefined();
    });

    it("should return true and delete when observations exist", async () => {
      const projectId = randomUUID();
      const traceId = randomUUID();
      const observationId = randomUUID();

      await createObservationsCh([
        createObservation({
          id: observationId,
          trace_id: traceId,
          project_id: projectId,
        }),
      ]);

      await expect(
        getObservationById({ id: observationId, projectId }),
      ).toBeDefined();

      const result = await deleteObservationsByProjectId(projectId);
      expect(result).toBe(true);

      await expect(
        getObservationById({ id: observationId, projectId }),
      ).rejects.toThrowError("not found");
    });

    it("should return true and delete when scores exist", async () => {
      const projectId = randomUUID();
      const traceId = randomUUID();
      const scoreId = randomUUID();

      await createScoresCh([
        createTraceScore({
          id: scoreId,
          trace_id: traceId,
          project_id: projectId,
        }),
      ]);

      const scoreBefore = await getScoreById({ projectId, scoreId });
      expect(scoreBefore).toBeDefined();

      const result = await deleteScoresByProjectId(projectId);
      expect(result).toBe(true);

      const scoreAfter = await getScoreById({ projectId, scoreId });
      expect(scoreAfter).toBeUndefined();
    });
  });

  describe("delete OlderThanDays functions with hasAny probe", () => {
    it("should return false when no traces older than cutoff exist and retain newer traces", async () => {
      const projectId = randomUUID();
      const traceId = randomUUID();
      const now = new Date();
      const cutoffDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); // 7 days ago

      // Create a trace that is NEWER than cutoff (should be retained)
      await createTracesCh([
        createTrace({
          id: traceId,
          project_id: projectId,
          timestamp: convertDateToClickhouseDateTime(now),
        }),
      ]);

      // No traces older than cutoff exist, so should return false
      const result = await deleteTracesOlderThanDays(projectId, cutoffDate);
      expect(result).toBe(false);

      // Verify the newer trace is still there (retained)
      const trace = await getTraceById({ traceId, projectId });
      expect(trace).toBeDefined();
    });

    it("should return true, delete old traces, and retain newer traces", async () => {
      const projectId = randomUUID();
      const oldTraceId = randomUUID();
      const newTraceId = randomUUID();
      const now = new Date();
      const cutoffDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); // 7 days ago
      const oldDate = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000); // 14 days ago

      // Create an OLD trace (should be deleted)
      await createTracesCh([
        createTrace({
          id: oldTraceId,
          project_id: projectId,
          timestamp: convertDateToClickhouseDateTime(oldDate),
        }),
      ]);

      // Create a NEW trace (should be retained)
      await createTracesCh([
        createTrace({
          id: newTraceId,
          project_id: projectId,
          timestamp: convertDateToClickhouseDateTime(now),
        }),
      ]);

      // Should return true since old data exists
      const result = await deleteTracesOlderThanDays(projectId, cutoffDate);
      expect(result).toBe(true);

      // Verify old trace is deleted
      const oldTrace = await getTraceById({ traceId: oldTraceId, projectId });
      expect(oldTrace).toBeUndefined();

      // Verify new trace is retained
      const newTrace = await getTraceById({ traceId: newTraceId, projectId });
      expect(newTrace).toBeDefined();
    });

    it("should return false when no observations older than cutoff exist and retain newer observations", async () => {
      const projectId = randomUUID();
      const traceId = randomUUID();
      const observationId = randomUUID();
      const now = new Date();
      const cutoffDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); // 7 days ago

      // Create an observation that is NEWER than cutoff (should be retained)
      await createObservationsCh([
        createObservation({
          id: observationId,
          trace_id: traceId,
          project_id: projectId,
          start_time: convertDateToClickhouseDateTime(now),
        }),
      ]);

      // No observations older than cutoff exist, so should return false
      const result = await deleteObservationsOlderThanDays(
        projectId,
        cutoffDate,
      );
      expect(result).toBe(false);

      // Verify the newer observation is still there (retained)
      const observation = await getObservationById({
        id: observationId,
        projectId,
      });
      expect(observation).toBeDefined();
    });

    it("should return true, delete old observations, and retain newer observations", async () => {
      const projectId = randomUUID();
      const traceId = randomUUID();
      const oldObservationId = randomUUID();
      const newObservationId = randomUUID();
      const now = new Date();
      const cutoffDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); // 7 days ago
      const oldDate = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000); // 14 days ago

      // Create an OLD observation (should be deleted)
      await createObservationsCh([
        createObservation({
          id: oldObservationId,
          trace_id: traceId,
          project_id: projectId,
          start_time: convertDateToClickhouseDateTime(oldDate),
        }),
      ]);

      // Create a NEW observation (should be retained)
      await createObservationsCh([
        createObservation({
          id: newObservationId,
          trace_id: traceId,
          project_id: projectId,
          start_time: convertDateToClickhouseDateTime(now),
        }),
      ]);

      // Should return true since old data exists
      const result = await deleteObservationsOlderThanDays(
        projectId,
        cutoffDate,
      );
      expect(result).toBe(true);

      // Verify old observation is deleted
      await expect(
        getObservationById({ id: oldObservationId, projectId }),
      ).rejects.toThrowError("not found");

      // Verify new observation is retained
      const newObservation = await getObservationById({
        id: newObservationId,
        projectId,
      });
      expect(newObservation).toBeDefined();
    });

    it("should return false when no scores older than cutoff exist and retain newer scores", async () => {
      const projectId = randomUUID();
      const traceId = randomUUID();
      const scoreId = randomUUID();
      const now = new Date();
      const cutoffDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); // 7 days ago

      // Create a score that is NEWER than cutoff (should be retained)
      await createScoresCh([
        createTraceScore({
          id: scoreId,
          trace_id: traceId,
          project_id: projectId,
          timestamp: convertDateToClickhouseDateTime(now),
        }),
      ]);

      // No scores older than cutoff exist, so should return false
      const result = await deleteScoresOlderThanDays(projectId, cutoffDate);
      expect(result).toBe(false);

      // Verify the newer score is still there (retained)
      const score = await getScoreById({ projectId, scoreId });
      expect(score).toBeDefined();
    });

    it("should return true, delete old scores, and retain newer scores", async () => {
      const projectId = randomUUID();
      const traceId = randomUUID();
      const oldScoreId = randomUUID();
      const newScoreId = randomUUID();
      const now = new Date();
      const cutoffDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); // 7 days ago
      const oldDate = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000); // 14 days ago

      // Create an OLD score (should be deleted)
      await createScoresCh([
        createTraceScore({
          id: oldScoreId,
          trace_id: traceId,
          project_id: projectId,
          timestamp: convertDateToClickhouseDateTime(oldDate),
        }),
      ]);

      // Create a NEW score (should be retained)
      await createScoresCh([
        createTraceScore({
          id: newScoreId,
          trace_id: traceId,
          project_id: projectId,
          timestamp: convertDateToClickhouseDateTime(now),
        }),
      ]);

      // Should return true since old data exists
      const result = await deleteScoresOlderThanDays(projectId, cutoffDate);
      expect(result).toBe(true);

      // Verify old score is deleted
      const oldScore = await getScoreById({ projectId, scoreId: oldScoreId });
      expect(oldScore).toBeUndefined();

      // Verify new score is retained
      const newScore = await getScoreById({ projectId, scoreId: newScoreId });
      expect(newScore).toBeDefined();
    });
  });
});
