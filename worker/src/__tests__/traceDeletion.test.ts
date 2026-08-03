import { expect, describe, it, beforeAll, afterEach, vi } from "vitest";
import waitForExpect from "wait-for-expect";
import {
  clickhouseClient,
  createEvent,
  createEventsCh,
  createObservation,
  createObservationsCh,
  createOrgProjectAndApiKey,
  createTraceScore,
  createScoresCh,
  createTrace,
  createTracesCh,
  getBlobStorageByProjectId,
  getObservationsForTrace,
  getScoresForTraces,
  getTracesByIds,
  queryClickhouse,
  removeIngestionEventsFromS3AndDeleteClickhouseRefsForTraces,
  StorageService,
  StorageServiceFactory,
} from "@langfuse/shared/src/server";
import { randomUUID } from "crypto";
import { processClickhouseTraceDelete } from "../features/traces/processClickhouseTraceDelete";
import { env } from "../env";
import { prisma } from "@langfuse/shared/src/db";
import { skipUnlessClickhouseTablesExist } from "./helpers/clickhouseTables";

describe("trace deletion", () => {
  let eventStorageService: StorageService;
  let mediaStorageService: StorageService;

  beforeAll(() => {
    eventStorageService = StorageServiceFactory.getInstance({
      accessKeyId: env.LANGFUSE_S3_EVENT_UPLOAD_ACCESS_KEY_ID,
      secretAccessKey: env.LANGFUSE_S3_EVENT_UPLOAD_SECRET_ACCESS_KEY,
      bucketName: env.LANGFUSE_S3_EVENT_UPLOAD_BUCKET,
      endpoint: env.LANGFUSE_S3_EVENT_UPLOAD_ENDPOINT,
      region: env.LANGFUSE_S3_EVENT_UPLOAD_REGION,
      forcePathStyle: env.LANGFUSE_S3_EVENT_UPLOAD_FORCE_PATH_STYLE === "true",
    });

    mediaStorageService = StorageServiceFactory.getInstance({
      accessKeyId: env.LANGFUSE_S3_MEDIA_UPLOAD_ACCESS_KEY_ID,
      secretAccessKey: env.LANGFUSE_S3_MEDIA_UPLOAD_SECRET_ACCESS_KEY,
      bucketName: String(env.LANGFUSE_S3_MEDIA_UPLOAD_BUCKET),
      endpoint: env.LANGFUSE_S3_MEDIA_UPLOAD_ENDPOINT,
      region: env.LANGFUSE_S3_MEDIA_UPLOAD_REGION,
      forcePathStyle: env.LANGFUSE_S3_MEDIA_UPLOAD_FORCE_PATH_STYLE === "true",
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should delete all traces, observations, and scores from Clickhouse", async () => {
    // Setup
    const { projectId } = await createOrgProjectAndApiKey();

    const traceId = randomUUID();
    await createTracesCh([createTrace({ id: traceId })]);
    await createObservationsCh([createObservation({ trace_id: traceId })]);
    await createScoresCh([createTraceScore({ trace_id: traceId })]);

    // When
    await processClickhouseTraceDelete("projectId", [traceId]);

    // Then
    const traces = await getTracesByIds([traceId], projectId);
    expect(traces).toHaveLength(0);

    const observations = await getObservationsForTrace({
      traceId,
      projectId,
      includeIO: true,
    });
    expect(observations).toHaveLength(0);

    const scores = await getScoresForTraces({
      projectId,
      traceIds: [traceId],
    });
    expect(scores).toHaveLength(0);
  });

  it("should delete S3 media files for deleted traces", async () => {
    // Setup
    const { projectId } = await createOrgProjectAndApiKey();

    const traceId = randomUUID();
    const observationId = randomUUID();

    await createTracesCh([createTrace({ id: traceId, project_id: projectId })]);
    await createObservationsCh([
      createObservation({
        id: observationId,
        trace_id: traceId,
        project_id: projectId,
      }),
    ]);

    const fileType = "text/plain";
    const data = "Hello, world!";

    await Promise.all([
      mediaStorageService.uploadFile({
        fileName: `${projectId}/trace-${traceId}.txt`,
        fileType,
        data,
      }),
      mediaStorageService.uploadFile({
        fileName: `${projectId}/observation-${observationId}.txt`,
        fileType,
        data,
      }),
    ]);

    const traceMediaId = randomUUID();
    await prisma.media.create({
      data: {
        id: traceMediaId,
        sha256Hash: randomUUID(),
        projectId,
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3), // 3 days in the past
        bucketPath: `${projectId}/trace-${traceId}.txt`,
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
        mediaId: traceMediaId,
        field: "test",
      },
    });

    const observationMediaId = randomUUID();
    await prisma.media.create({
      data: {
        id: observationMediaId,
        sha256Hash: randomUUID(),
        projectId,
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3), // 3 days in the past
        bucketPath: `${projectId}/observation-${observationId}.txt`,
        bucketName: String(env.LANGFUSE_S3_MEDIA_UPLOAD_BUCKET),
        contentType: fileType,
        contentLength: 0,
      },
    });
    await prisma.observationMedia.create({
      data: {
        id: randomUUID(),
        projectId,
        observationId,
        traceId,
        mediaId: observationMediaId,
        field: "test",
      },
    });

    // When
    await processClickhouseTraceDelete(projectId, [traceId]);

    // Then
    const files = await mediaStorageService.listFiles(projectId);
    expect(files).toHaveLength(0);

    const media = await prisma.media.findMany({
      where: {
        projectId,
      },
    });
    expect(media).toHaveLength(0);

    await expect(
      prisma.traceMedia.findMany({ where: { projectId } }),
    ).resolves.toHaveLength(0);
    await expect(
      prisma.observationMedia.findMany({ where: { projectId } }),
    ).resolves.toHaveLength(0);
  });

  it("should NOT delete S3 media files for deleted traces if referenced by other entity", async () => {
    // Setup
    const { projectId } = await createOrgProjectAndApiKey();

    const traceId1 = randomUUID();
    const traceId2 = randomUUID();

    await createTracesCh([
      createTrace({ id: traceId1, project_id: projectId }),
      createTrace({ id: traceId2, project_id: projectId }),
    ]);

    const fileType = "text/plain";
    const data = "Hello, world!";

    await mediaStorageService.uploadFile({
      fileName: `${projectId}/trace-${traceId1}.txt`,
      fileType,
      data,
    });

    const traceMediaId = randomUUID();
    await prisma.media.create({
      data: {
        id: traceMediaId,
        sha256Hash: randomUUID(),
        projectId,
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3), // 3 days in the past
        bucketPath: `${projectId}/trace-${traceId1}.txt`,
        bucketName: String(env.LANGFUSE_S3_MEDIA_UPLOAD_BUCKET),
        contentType: fileType,
        contentLength: 0,
      },
    });
    // Create TWO references to media item
    await prisma.traceMedia.create({
      data: {
        id: randomUUID(),
        projectId,
        traceId: traceId1,
        mediaId: traceMediaId,
        field: "test",
      },
    });
    await prisma.traceMedia.create({
      data: {
        id: randomUUID(),
        projectId,
        traceId: traceId2,
        mediaId: traceMediaId,
        field: "test",
      },
    });

    // When
    await processClickhouseTraceDelete(projectId, [traceId1]);

    // Then
    const files = await mediaStorageService.listFiles(projectId);
    expect(files).toHaveLength(1);

    const media = await prisma.media.findMany({
      where: {
        projectId,
      },
    });
    expect(media).toHaveLength(1);

    const traceMedia = await prisma.traceMedia.findMany({
      where: {
        projectId,
      },
    });
    expect(traceMedia).toHaveLength(1);
  });

  it("should NOT delete S3 media files for deleted traces if referenced by a dataset item", async () => {
    // Setup
    const { projectId } = await createOrgProjectAndApiKey();

    const traceId = randomUUID();
    await createTracesCh([createTrace({ id: traceId, project_id: projectId })]);

    const fileType = "text/plain";
    await mediaStorageService.uploadFile({
      fileName: `${projectId}/trace-${traceId}.txt`,
      fileType,
      data: "Hello, world!",
    });

    const mediaId = randomUUID();
    await prisma.media.create({
      data: {
        id: mediaId,
        sha256Hash: randomUUID(),
        projectId,
        bucketPath: `${projectId}/trace-${traceId}.txt`,
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
    await prisma.datasetItemMedia.create({
      data: {
        id: randomUUID(),
        projectId,
        datasetId: randomUUID(),
        datasetItemId: randomUUID(),
        datasetItemValidFrom: new Date(),
        mediaId,
        field: "input",
        jsonPath: "$['image']",
        referenceString: `@@@langfuseMedia:type=text/plain|id=${mediaId}|source=bytes@@@`,
      },
    });

    // When
    await processClickhouseTraceDelete(projectId, [traceId]);

    // Then: trace link removed, but media and S3 file survive
    await expect(
      prisma.traceMedia.findMany({ where: { projectId } }),
    ).resolves.toHaveLength(0);
    await expect(
      prisma.media.findMany({ where: { projectId } }),
    ).resolves.toHaveLength(1);
    const files = await mediaStorageService.listFiles(projectId);
    expect(files).toHaveLength(1);
  });

  it("deletes trace media and sweeps a pending dataset association on trace deletion", async () => {
    const { projectId } = await createOrgProjectAndApiKey();

    const traceId = randomUUID();
    await createTracesCh([createTrace({ id: traceId, project_id: projectId })]);

    const fileType = "text/plain";
    await mediaStorageService.uploadFile({
      fileName: `${projectId}/trace-${traceId}.txt`,
      fileType,
      data: "Hello, world!",
    });

    const mediaId = randomUUID();
    await prisma.media.create({
      data: {
        id: mediaId,
        sha256Hash: randomUUID(),
        projectId,
        bucketPath: `${projectId}/trace-${traceId}.txt`,
        bucketName: String(env.LANGFUSE_S3_MEDIA_UPLOAD_BUCKET),
        contentType: fileType,
        contentLength: 0,
      },
    });
    await prisma.traceMedia.create({
      data: { id: randomUUID(), projectId, traceId, mediaId, field: "test" },
    });
    // Pending association (null validFrom): an abandoned upload, not a claimed
    // item reference, so it must not protect the trace media from cleanup.
    await prisma.datasetItemMedia.create({
      data: {
        id: randomUUID(),
        projectId,
        datasetId: randomUUID(),
        datasetItemId: randomUUID(),
        datasetItemValidFrom: null,
        mediaId,
        field: "input",
        jsonPath: null,
        referenceString: null,
      },
    });

    // When
    await processClickhouseTraceDelete(projectId, [traceId]);

    // Then: media, S3 file, and the pending row are all reclaimed
    await expect(
      prisma.media.findMany({ where: { projectId } }),
    ).resolves.toHaveLength(0);
    await expect(
      prisma.datasetItemMedia.findMany({ where: { projectId } }),
    ).resolves.toHaveLength(0);
    const files = await mediaStorageService.listFiles(projectId);
    expect(files).toHaveLength(0);
  });

  it("should delete S3 event files for deleted traces", async () => {
    // Setup
    const { projectId } = await createOrgProjectAndApiKey();

    const traceId = randomUUID();
    const observationId = randomUUID();
    const scoreId = randomUUID();

    await createTracesCh([createTrace({ id: traceId, project_id: projectId })]);
    await createObservationsCh([
      createObservation({
        id: observationId,
        trace_id: traceId,
        project_id: projectId,
      }),
    ]);
    await createScoresCh([
      createTraceScore({
        id: scoreId,
        trace_id: traceId,
        project_id: projectId,
      }),
    ]);

    const fileType = "application/json";
    const data = JSON.stringify({ hello: "world" });

    await Promise.all([
      eventStorageService.uploadFile({
        fileName: `${projectId}/traces/${traceId}-trace.json`,
        fileType,
        data,
      }),
      eventStorageService.uploadFile({
        fileName: `${projectId}/observation/${traceId}-observation.json`,
        fileType,
        data,
      }),
      eventStorageService.uploadFile({
        fileName: `${projectId}/score/${traceId}-score.json`,
        fileType,
        data,
      }),
    ]);

    await clickhouseClient().insert({
      table: "blob_storage_file_log",
      format: "JSONEachRow",
      values: [
        {
          id: randomUUID(),
          project_id: projectId,
          entity_type: "trace",
          entity_id: traceId,
          event_id: randomUUID(),
          bucket_name: env.LANGFUSE_S3_EVENT_UPLOAD_BUCKET,
          bucket_path: `${projectId}/traces/${traceId}-trace.json`,
          created_at: new Date().getTime(),
          updated_at: new Date().getTime(),
        },
        {
          id: randomUUID(),
          project_id: projectId,
          entity_type: "observation",
          entity_id: observationId,
          event_id: randomUUID(),
          bucket_name: env.LANGFUSE_S3_EVENT_UPLOAD_BUCKET,
          bucket_path: `${projectId}/observation/${traceId}-observation.json`,
          created_at: new Date().getTime(),
          updated_at: new Date().getTime(),
        },
        {
          id: randomUUID(),
          project_id: projectId,
          entity_type: "score",
          entity_id: scoreId,
          event_id: randomUUID(),
          bucket_name: env.LANGFUSE_S3_EVENT_UPLOAD_BUCKET,
          bucket_path: `${projectId}/score/${traceId}-score.json`,
          created_at: new Date().getTime(),
          updated_at: new Date().getTime(),
        },
      ],
    });

    // When
    await processClickhouseTraceDelete(projectId, [traceId]);

    // Then
    const eventLog = getBlobStorageByProjectId(projectId);
    for await (const _ of eventLog) {
      // Should never happen as the expect event log to be empty
      expect(true).toBe(false);
    }

    const files = await eventStorageService.listFiles(projectId);
    expect(files).toHaveLength(0);
  });

  it("should clean up a trace blob ref that has no row in the traces table", async () => {
    // Setup: a blob ref for a trace whose `traces` row does not exist (e.g. a
    // project in v4 events_only write mode where traces are not written to the
    // legacy `traces` table). The old query joined against `traces`, so this
    // ref was missed and the S3 file leaked.
    const { projectId } = await createOrgProjectAndApiKey();

    const traceId = randomUUID();
    const bucketPath = `${projectId}/traces/${traceId}-trace.json`;

    await eventStorageService.uploadFile({
      fileName: bucketPath,
      fileType: "application/json",
      data: JSON.stringify({ hello: "world" }),
    });

    await clickhouseClient().insert({
      table: "blob_storage_file_log",
      format: "JSONEachRow",
      values: [
        {
          id: randomUUID(),
          project_id: projectId,
          entity_type: "trace",
          entity_id: traceId,
          event_id: randomUUID(),
          bucket_name: env.LANGFUSE_S3_EVENT_UPLOAD_BUCKET,
          bucket_path: bucketPath,
          created_at: new Date().getTime(),
          updated_at: new Date().getTime(),
        },
      ],
    });

    // When: no traces/observations/scores rows exist at all
    await removeIngestionEventsFromS3AndDeleteClickhouseRefsForTraces({
      projectId,
      traceIds: [traceId],
      includeEventsTable: false,
    });

    // Then: blob ref soft-deleted (invisible under FINAL) and S3 file gone
    const eventLog = getBlobStorageByProjectId(projectId);
    for await (const _ of eventLog) {
      expect(true).toBe(false);
    }

    const files = await eventStorageService.listFiles(projectId);
    expect(files).toHaveLength(0);
  });

  it("should clean up an events-only observation blob ref when includeEventsTable is true", async (ctx) => {
    await skipUnlessClickhouseTablesExist(
      ctx,
      ["events_core"],
      "events ClickHouse tables are not enabled",
    );

    // Setup: a span that exists only in the events pipeline (events_full →
    // events_core via MV), with no row in the legacy `observations` table.
    const { projectId } = await createOrgProjectAndApiKey();

    const traceId = randomUUID();
    const spanId = randomUUID();
    const eventTime = Date.now() * 1000; // micros

    await createEventsCh([
      createEvent({
        id: spanId,
        span_id: spanId,
        trace_id: traceId,
        project_id: projectId,
        start_time: eventTime,
        created_at: eventTime,
        updated_at: eventTime,
        event_ts: eventTime,
      }),
    ]);

    // The events_core materialized view populates asynchronously; wait for the
    // span to land before deleting so the query can prune to it.
    await waitForExpect(async () => {
      const rows = await queryClickhouse<{ count: string }>({
        query: `
          select count(*) as count
          from events_core
          where project_id = {projectId: String}
            and trace_id in ({traceIds: Array(String)})
        `,
        params: { projectId, traceIds: [traceId] },
      });
      expect(Number(rows[0]?.count ?? 0)).toBe(1);
    }, 20_000);

    const bucketPath = `${projectId}/observation/${spanId}-observation.json`;
    await eventStorageService.uploadFile({
      fileName: bucketPath,
      fileType: "application/json",
      data: JSON.stringify({ hello: "world" }),
    });

    await clickhouseClient().insert({
      table: "blob_storage_file_log",
      format: "JSONEachRow",
      values: [
        {
          id: randomUUID(),
          project_id: projectId,
          entity_type: "observation",
          entity_id: spanId,
          event_id: randomUUID(),
          bucket_name: env.LANGFUSE_S3_EVENT_UPLOAD_BUCKET,
          bucket_path: bucketPath,
          created_at: new Date().getTime(),
          updated_at: new Date().getTime(),
        },
      ],
    });

    // When
    await removeIngestionEventsFromS3AndDeleteClickhouseRefsForTraces({
      projectId,
      traceIds: [traceId],
      includeEventsTable: true,
    });

    // Then: blob ref soft-deleted and S3 file removed
    const eventLog = getBlobStorageByProjectId(projectId);
    for await (const _ of eventLog) {
      expect(true).toBe(false);
    }

    const files = await eventStorageService.listFiles(projectId);
    expect(files).toHaveLength(0);
  });

  it("should clean up legacy trace/observation/score blob refs with includeEventsTable false", async () => {
    // Gating: with the events branch disabled, legacy data backed by the
    // traces/observations/scores tables must be cleaned exactly as before.
    const { projectId } = await createOrgProjectAndApiKey();

    const traceId = randomUUID();
    const observationId = randomUUID();
    const scoreId = randomUUID();

    await createTracesCh([createTrace({ id: traceId, project_id: projectId })]);
    await createObservationsCh([
      createObservation({
        id: observationId,
        trace_id: traceId,
        project_id: projectId,
      }),
    ]);
    await createScoresCh([
      createTraceScore({
        id: scoreId,
        trace_id: traceId,
        project_id: projectId,
      }),
    ]);

    const fileType = "application/json";
    const data = JSON.stringify({ hello: "world" });

    await Promise.all([
      eventStorageService.uploadFile({
        fileName: `${projectId}/traces/${traceId}-trace.json`,
        fileType,
        data,
      }),
      eventStorageService.uploadFile({
        fileName: `${projectId}/observation/${observationId}-observation.json`,
        fileType,
        data,
      }),
      eventStorageService.uploadFile({
        fileName: `${projectId}/score/${scoreId}-score.json`,
        fileType,
        data,
      }),
    ]);

    await clickhouseClient().insert({
      table: "blob_storage_file_log",
      format: "JSONEachRow",
      values: [
        {
          id: randomUUID(),
          project_id: projectId,
          entity_type: "trace",
          entity_id: traceId,
          event_id: randomUUID(),
          bucket_name: env.LANGFUSE_S3_EVENT_UPLOAD_BUCKET,
          bucket_path: `${projectId}/traces/${traceId}-trace.json`,
          created_at: new Date().getTime(),
          updated_at: new Date().getTime(),
        },
        {
          id: randomUUID(),
          project_id: projectId,
          entity_type: "observation",
          entity_id: observationId,
          event_id: randomUUID(),
          bucket_name: env.LANGFUSE_S3_EVENT_UPLOAD_BUCKET,
          bucket_path: `${projectId}/observation/${observationId}-observation.json`,
          created_at: new Date().getTime(),
          updated_at: new Date().getTime(),
        },
        {
          id: randomUUID(),
          project_id: projectId,
          entity_type: "score",
          entity_id: scoreId,
          event_id: randomUUID(),
          bucket_name: env.LANGFUSE_S3_EVENT_UPLOAD_BUCKET,
          bucket_path: `${projectId}/score/${scoreId}-score.json`,
          created_at: new Date().getTime(),
          updated_at: new Date().getTime(),
        },
      ],
    });

    // When
    await removeIngestionEventsFromS3AndDeleteClickhouseRefsForTraces({
      projectId,
      traceIds: [traceId],
      includeEventsTable: false,
    });

    // Then
    const eventLog = getBlobStorageByProjectId(projectId);
    for await (const _ of eventLog) {
      expect(true).toBe(false);
    }

    const files = await eventStorageService.listFiles(projectId);
    expect(files).toHaveLength(0);
  });
});
