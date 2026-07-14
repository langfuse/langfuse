import { Readable } from "stream";
import {
  getBlobStorageByProjectId,
  getBlobStorageByProjectIdAndEntityIds,
  getBlobStorageByProjectIdAndTraceIds,
  getBlobStorageByProjectIdBeforeDate,
} from "../repositories/blobStorageLog";
import { BlobStorageFileRefRecordReadType } from "../repositories/definitions";
import { logger } from "../logger";
import { env } from "../../env";
import { clickhouseClient } from "../clickhouse/client";
import { buildClickHouseLogComment } from "../clickhouse/queryTags";
import { getS3EventStorageClient, S3_DELETE_OBJECTS_CHUNK_SIZE } from "../s3";

// Derive the default from the S3 DeleteObjects chunk size so a full chunk is
// exactly one S3 API request (plus its internal retries) and the two can't
// drift.
const DEFAULT_S3_CHUNK_SIZE = S3_DELETE_OBJECTS_CHUNK_SIZE;
// ClickHouse best practice batches inserts at 10k–100k rows; small tombstone
// inserts create part-count pressure on blob_storage_file_log.
const DEFAULT_TOMBSTONE_FLUSH_SIZE = 10_000;

/**
 * Tuning knobs for the blob-storage cleanup pipeline. All optional; defaults are
 * production values. Tests inject tiny values to exercise chunking, batching, and
 * the concurrency bound cheaply.
 */
type BlobCleanupPipelineOptions = {
  // Refs per S3 deleteFiles call. Default matches the StorageService internal
  // DeleteObjectsCommand chunk (900) so one dispatch is exactly one S3 request.
  s3ChunkSize?: number;
  // Max concurrent deleteFiles calls in flight; backpressures the ClickHouse ref
  // stream and bounds resident memory. Defaults to the shared env knob.
  s3Concurrency?: number;
  // Refs buffered before a single tombstone insert. Larger batches mean fewer,
  // bigger inserts (ClickHouse best practice; less part-count pressure).
  tombstoneFlushSize?: number;
};

export const deleteIngestionEventsFromS3AndClickhouseForScores = async (
  p: {
    projectId: string;
    scoreIds: string[];
  } & BlobCleanupPipelineOptions,
) => {
  const stream = getBlobStorageByProjectIdAndEntityIds(
    p.projectId,
    "score",
    p.scoreIds,
  );

  return removeIngestionEventsFromS3AndDeleteClickhouseRefs({
    projectId: p.projectId,
    stream,
    s3ChunkSize: p.s3ChunkSize,
    s3Concurrency: p.s3Concurrency,
    tombstoneFlushSize: p.tombstoneFlushSize,
  });
};

export const removeIngestionEventsFromS3AndDeleteClickhouseRefsForTraces =
  async (
    p: {
      projectId: string;
      traceIds: string[];
      includeEventsTable?: boolean;
    } & BlobCleanupPipelineOptions,
  ) => {
    const stream = getBlobStorageByProjectIdAndTraceIds(
      p.projectId,
      p.traceIds,
      { includeEventsTable: p.includeEventsTable ?? false },
    );

    return removeIngestionEventsFromS3AndDeleteClickhouseRefs({
      projectId: p.projectId,
      stream: stream,
      s3ChunkSize: p.s3ChunkSize,
      s3Concurrency: p.s3Concurrency,
      tombstoneFlushSize: p.tombstoneFlushSize,
    });
  };

export const removeIngestionEventsFromS3AndDeleteClickhouseRefsForProject = (
  projectId: string,
  cutOffDate: Date | undefined,
  options?: BlobCleanupPipelineOptions,
) => {
  const stream = cutOffDate
    ? getBlobStorageByProjectIdBeforeDate(projectId, cutOffDate)
    : getBlobStorageByProjectId(projectId);

  return removeIngestionEventsFromS3AndDeleteClickhouseRefs({
    projectId: projectId,
    stream: stream,
    s3ChunkSize: options?.s3ChunkSize,
    s3Concurrency: options?.s3Concurrency,
    tombstoneFlushSize: options?.tombstoneFlushSize,
  });
};

/**
 * Groups `source` into arrays of at most `size` elements, in order. The final
 * group may be smaller than `size`.
 */
async function* chunk<T>(
  source: AsyncIterable<T>,
  size: number,
): AsyncGenerator<T[]> {
  let batch: T[] = [];
  for await (const item of source) {
    batch.push(item);
    if (batch.length >= size) {
      yield batch;
      batch = [];
    }
  }
  if (batch.length > 0) yield batch;
}

async function removeIngestionEventsFromS3AndDeleteClickhouseRefs(
  p: {
    projectId: string;
    stream: AsyncGenerator<BlobStorageFileRefRecordReadType>;
  } & BlobCleanupPipelineOptions,
) {
  const { projectId, stream } = p;
  // Cap at the S3 DeleteObjects chunk size: deleteFiles re-chunks internally at
  // that limit, so a larger value would turn one dispatch into several S3
  // requests and inflate the real in-flight request count past s3Concurrency.
  const s3ChunkSize = Math.min(
    p.s3ChunkSize ?? DEFAULT_S3_CHUNK_SIZE,
    S3_DELETE_OBJECTS_CHUNK_SIZE,
  );
  const s3Concurrency =
    p.s3Concurrency ?? env.LANGFUSE_BLOB_STORAGE_DELETE_S3_CONCURRENCY;
  const tombstoneFlushSize =
    p.tombstoneFlushSize ?? DEFAULT_TOMBSTONE_FLUSH_SIZE;

  const eventStorageClient = getS3EventStorageClient(
    env.LANGFUSE_S3_EVENT_UPLOAD_BUCKET,
  );

  let pendingTombstones: BlobStorageFileRefRecordReadType[] = [];
  let dispatchedBatches = 0;
  let flushes = 0;

  const flushTombstones = async () => {
    if (pendingTombstones.length === 0) {
      return;
    }
    const toFlush = pendingTombstones;
    pendingTombstones = [];
    await softDeleteInClickhouse(toFlush, { projectId });
    flushes++;
    logger.info(
      `Tombstoned ${toFlush.length} blob storage refs (flush ${flushes}) for project ${projectId}`,
    );
  };

  // Cleanup is at-least-once: a ref reaches `pendingTombstones` only when the
  // `.map` stage yields it, i.e. strictly after its chunk's `deleteFiles` call
  // resolved -- so a ref can never be hidden from retry discovery while its S3
  // object still exists (the one direction that would leak permanently).
  // (`Readable.map`'s typings report `Readable`/`any` for the mapped async
  // iterator; the cast only restores the loop variable's real type, it doesn't
  // relax the function's signature.)
  const mapped = Readable.from(chunk(stream, s3ChunkSize)).map(
    async (refs: BlobStorageFileRefRecordReadType[]) => {
      dispatchedBatches++;
      logger.info(
        `Dispatched S3 delete batch ${dispatchedBatches} of ${refs.length} refs for project ${projectId}`,
      );
      // deleteFiles already retries 3x internally; a rejection here is terminal.
      await eventStorageClient.deleteFiles(refs.map((r) => r.bucket_path));
      return refs;
    },
    { concurrency: s3Concurrency },
  );

  try {
    for await (const deletedRefs of mapped as AsyncIterable<
      BlobStorageFileRefRecordReadType[]
    >) {
      pendingTombstones.push(...deletedRefs);
      if (pendingTombstones.length >= tombstoneFlushSize) {
        await flushTombstones();
      }
    }
  } finally {
    // Tombstone whatever has been deleted but not yet flushed -- the final
    // partial batch on success, or the already-succeeded chunks on error --
    // so a retry resumes past them instead of redoing their deletes. Runs on
    // both paths; flushTombstones() no-ops when the buffer is empty, so it
    // never double-inserts. A throw here on the error path replaces the
    // original error, which is acceptable: both outcomes just mean "retry",
    // and every un-tombstoned ref stays FINAL-visible and idempotently
    // re-deletable regardless.
    await flushTombstones();
  }

  logger.info(
    `Completed blob storage cleanup for project ${projectId}: ${dispatchedBatches} S3 delete batches, ${flushes} tombstone flushes`,
  );
}

async function softDeleteInClickhouse(
  blobStorageRefs: BlobStorageFileRefRecordReadType[],
  p: {
    projectId: string;
  },
) {
  if (blobStorageRefs.length === 0) {
    return;
  }

  await clickhouseClient().insert({
    table: "blob_storage_file_log",
    values: blobStorageRefs.map((e) => ({
      ...e,
      is_deleted: "1",
      event_ts: new Date().getTime(),
      updated_at: new Date().getTime(),
    })),
    format: "JSONEachRow",
    clickhouse_settings: {
      log_comment: buildClickHouseLogComment({
        projectId: p.projectId,
      }),
    },
  });
}
