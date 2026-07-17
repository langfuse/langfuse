import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import waitForExpect from "wait-for-expect";
import {
  clickhouseClient,
  createOrgProjectAndApiKey,
  getBlobStorageByProjectId,
  getS3EventStorageClient,
  removeIngestionEventsFromS3AndDeleteClickhouseRefsForProject,
  StorageService,
  StorageServiceFactory,
} from "@langfuse/shared/src/server";
import { randomUUID } from "crypto";
import { env } from "../env";

type SeededRef = { entityId: string; bucketPath: string };

describe("ingestion file deletion pipeline", () => {
  let eventStorageService: StorageService;

  beforeAll(() => {
    eventStorageService = StorageServiceFactory.getInstance({
      accessKeyId: env.LANGFUSE_S3_EVENT_UPLOAD_ACCESS_KEY_ID,
      secretAccessKey: env.LANGFUSE_S3_EVENT_UPLOAD_SECRET_ACCESS_KEY,
      bucketName: env.LANGFUSE_S3_EVENT_UPLOAD_BUCKET,
      endpoint: env.LANGFUSE_S3_EVENT_UPLOAD_ENDPOINT,
      region: env.LANGFUSE_S3_EVENT_UPLOAD_REGION,
      forcePathStyle: env.LANGFUSE_S3_EVENT_UPLOAD_FORCE_PATH_STYLE === "true",
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Seeds `count` blob storage refs for a project: uploads a matching S3 object
   * for each ref (so real deletes have something to remove) and inserts the log
   * rows. Returns the refs so tests can reason about individual bucket paths.
   */
  const seedRefs = async (
    projectId: string,
    count: number,
    opts?: { uploadFiles?: boolean },
  ): Promise<SeededRef[]> => {
    const refs: SeededRef[] = Array.from({ length: count }, () => {
      const entityId = randomUUID();
      return {
        entityId,
        bucketPath: `${projectId}/traces/${entityId}-trace.json`,
      };
    });

    if (opts?.uploadFiles !== false) {
      await Promise.all(
        refs.map((r) =>
          eventStorageService.uploadFile({
            fileName: r.bucketPath,
            fileType: "application/json",
            data: JSON.stringify({ hello: "world" }),
          }),
        ),
      );
    }

    await clickhouseClient().insert({
      table: "blob_storage_file_log",
      format: "JSONEachRow",
      values: refs.map((r) => ({
        id: randomUUID(),
        project_id: projectId,
        entity_type: "trace",
        entity_id: r.entityId,
        event_id: randomUUID(),
        bucket_name: env.LANGFUSE_S3_EVENT_UPLOAD_BUCKET,
        bucket_path: r.bucketPath,
        created_at: new Date().getTime(),
        updated_at: new Date().getTime(),
      })),
    });

    return refs;
  };

  /** Collects the bucket paths still visible under FINAL (i.e. not tombstoned). */
  const visibleBucketPaths = async (projectId: string): Promise<string[]> => {
    const paths: string[] = [];
    for await (const ref of getBlobStorageByProjectId(projectId)) {
      paths.push(ref.bucket_path);
    }
    return paths;
  };

  it("deletes every S3 object, tombstones every ref, and batches tombstone flushes independently of the S3 chunk size", async () => {
    const { projectId } = await createOrgProjectAndApiKey();
    const refs = await seedRefs(projectId, 13);

    const eventStorageClient = getS3EventStorageClient(
      env.LANGFUSE_S3_EVENT_UPLOAD_BUCKET,
    );
    const deleteFilesSpy = vi.spyOn(eventStorageClient, "deleteFiles");
    // Count only the tombstone inserts issued by the consumer (seeding already
    // happened above, before the spy was installed).
    const insertSpy = vi.spyOn(clickhouseClient(), "insert");

    // chunk 3 => ceil(13/3) = 5 S3 deletes; flush 5 with concurrency 1 (so
    // completion order is deterministic) => flushes at buffer sizes 6, 6, 1 = 3
    // tombstone inserts. The batching is driven by the flush threshold, NOT by
    // the S3 chunk count (which would be 5 under the old one-insert-per-chunk
    // shape).
    await removeIngestionEventsFromS3AndDeleteClickhouseRefsForProject(
      projectId,
      undefined,
      { s3ChunkSize: 3, s3Concurrency: 1, tombstoneFlushSize: 5 },
    );

    // Every ref tombstoned (invisible under FINAL).
    expect(await visibleBucketPaths(projectId)).toHaveLength(0);

    // Every S3 object removed.
    const files = await eventStorageService.listFiles(projectId);
    expect(files).toHaveLength(0);

    // Exactly one S3 delete per chunk.
    expect(deleteFilesSpy).toHaveBeenCalledTimes(5);
    for (const call of deleteFilesSpy.mock.calls) {
      expect((call[0] as string[]).length).toBeLessThanOrEqual(3);
    }

    // Tombstone inserts are batched by the flush threshold, not by S3 chunk.
    expect(insertSpy).toHaveBeenCalledTimes(3);
    expect(insertSpy.mock.calls.length).toBeLessThan(
      deleteFilesSpy.mock.calls.length,
    );

    // Sanity: all seeded paths were passed to some delete call.
    const deletedPaths = new Set(
      deleteFilesSpy.mock.calls.flatMap((call) => call[0] as string[]),
    );
    for (const ref of refs) {
      expect(deletedPaths.has(ref.bucketPath)).toBe(true);
    }
  });

  it("rethrows on a failed chunk, tombstones only the chunks that succeeded, and leaves the failed chunk retry-able", async () => {
    const { projectId } = await createOrgProjectAndApiKey();
    await seedRefs(projectId, 13);

    const eventStorageClient = getS3EventStorageClient(
      env.LANGFUSE_S3_EVENT_UPLOAD_BUCKET,
    );
    const realDeleteFiles =
      eventStorageClient.deleteFiles.bind(eventStorageClient);

    let callIndex = 0;
    const succeededPaths: string[] = [];
    let failedPaths: string[] = [];
    // Concurrency 1 => strictly sequential dispatch, so the 3rd chunk (index 2)
    // fails only after chunks 0 and 1 fully resolved. Fail-fast then abandons
    // the remaining chunks.
    vi.spyOn(eventStorageClient, "deleteFiles").mockImplementation(
      async (paths: string[]) => {
        const idx = callIndex++;
        if (idx === 2) {
          failedPaths = [...paths];
          throw new Error("Simulated S3 delete failure");
        }
        await realDeleteFiles(paths);
        succeededPaths.push(...paths);
      },
    );

    await expect(
      removeIngestionEventsFromS3AndDeleteClickhouseRefsForProject(
        projectId,
        undefined,
        { s3ChunkSize: 3, s3Concurrency: 1, tombstoneFlushSize: 5 },
      ),
    ).rejects.toThrow("Simulated S3 delete failure");

    // Chunks 0 and 1 succeeded (6 refs); chunk 2 failed (3 refs); chunks 3 and 4
    // were never dispatched (fail-fast) => 7 refs remain visible.
    expect(succeededPaths).toHaveLength(6);
    expect(failedPaths).toHaveLength(3);

    const visible = new Set(await visibleBucketPaths(projectId));

    // Succeeded chunks tombstoned so a retry does not redo their S3 work.
    for (const path of succeededPaths) {
      expect(visible.has(path)).toBe(false);
    }
    // Failed chunk stays visible for a retry (its refs were never tombstoned).
    for (const path of failedPaths) {
      expect(visible.has(path)).toBe(true);
    }
    // 13 total - 6 succeeded = 7 still visible (3 failed + 4 never dispatched).
    expect(visible.size).toBe(7);
  });

  it("checkpoints already-deleted chunks on failure even when the flush threshold was never reached", async () => {
    const { projectId } = await createOrgProjectAndApiKey();
    await seedRefs(projectId, 13);

    const eventStorageClient = getS3EventStorageClient(
      env.LANGFUSE_S3_EVENT_UPLOAD_BUCKET,
    );
    const realDeleteFiles =
      eventStorageClient.deleteFiles.bind(eventStorageClient);

    let callIndex = 0;
    const succeededPaths: string[] = [];
    let failedPaths: string[] = [];
    vi.spyOn(eventStorageClient, "deleteFiles").mockImplementation(
      async (paths: string[]) => {
        const idx = callIndex++;
        if (idx === 2) {
          failedPaths = [...paths];
          throw new Error("Simulated S3 delete failure");
        }
        await realDeleteFiles(paths);
        succeededPaths.push(...paths);
      },
    );

    await expect(
      removeIngestionEventsFromS3AndDeleteClickhouseRefsForProject(
        projectId,
        undefined,
        // tombstoneFlushSize (100) far exceeds the 6 refs the succeeding chunks
        // produce, so the in-loop flush never fires: the ONLY thing that can
        // tombstone them before the error propagates is the finally-flush. This
        // pins that fail-path checkpoint against regressing back to "no error
        // handling", which would leave all 6 visible and redone on retry.
        { s3ChunkSize: 3, s3Concurrency: 1, tombstoneFlushSize: 100 },
      ),
    ).rejects.toThrow("Simulated S3 delete failure");

    expect(succeededPaths).toHaveLength(6);
    expect(failedPaths).toHaveLength(3);

    const visible = new Set(await visibleBucketPaths(projectId));

    // The finally-flush checkpointed the succeeded chunks despite never hitting
    // the flush threshold, so a retry does not redo their S3 deletes.
    for (const path of succeededPaths) {
      expect(visible.has(path)).toBe(false);
    }
    // The failed chunk was never tombstoned -- it stays retry-able.
    for (const path of failedPaths) {
      expect(visible.has(path)).toBe(true);
    }
    // 6 checkpointed => 7 still visible (3 failed + 4 never dispatched).
    expect(visible.size).toBe(7);
  });

  it("never exceeds the configured concurrency while dispatching, and resumes as deletes settle", async () => {
    const { projectId } = await createOrgProjectAndApiKey();
    // No S3 objects needed: deleteFiles is fully mocked with deferred promises.
    await seedRefs(projectId, 5, { uploadFiles: false });

    const eventStorageClient = getS3EventStorageClient(
      env.LANGFUSE_S3_EVENT_UPLOAD_BUCKET,
    );

    let activeDeletes = 0;
    let maxActiveDeletes = 0;
    const resolvers: Array<() => void> = [];
    const deleteFilesSpy = vi
      .spyOn(eventStorageClient, "deleteFiles")
      .mockImplementation(() => {
        activeDeletes++;
        maxActiveDeletes = Math.max(maxActiveDeletes, activeDeletes);
        return new Promise<void>((resolve) => {
          resolvers.push(() => {
            activeDeletes--;
            resolve();
          });
        });
      });

    // chunk 1 => one delete per ref (5 chunks); concurrency 2; huge flush so no
    // tombstone flush interferes mid-stream.
    const runPromise =
      removeIngestionEventsFromS3AndDeleteClickhouseRefsForProject(
        projectId,
        undefined,
        { s3ChunkSize: 1, s3Concurrency: 2, tombstoneFlushSize: 100 },
      );

    // Pool saturates at exactly 2 and then blocks: no third dispatch yet.
    await waitForExpect(() => {
      expect(deleteFilesSpy).toHaveBeenCalledTimes(2);
    });
    expect(activeDeletes).toBe(2);
    expect(maxActiveDeletes).toBe(2);
    expect(deleteFilesSpy).toHaveBeenCalledTimes(2);

    // Settle one delete => exactly one more dispatch proceeds, bound still holds.
    resolvers[0]();
    await waitForExpect(() => {
      expect(deleteFilesSpy).toHaveBeenCalledTimes(3);
    });
    expect(maxActiveDeletes).toBe(2);

    // Drain the rest so the pipeline completes; keep resolving new deferreds as
    // they are dispatched (event-loop driven, no fixed delays).
    let settled = false;
    runPromise.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );
    let nextResolverIndex = 1;
    const pump = () => {
      while (nextResolverIndex < resolvers.length) {
        resolvers[nextResolverIndex++]();
      }
      if (!settled) setImmediate(pump);
    };
    pump();

    await runPromise;

    // The bound was never breached across the whole run, and every chunk ran.
    expect(maxActiveDeletes).toBe(2);
    expect(deleteFilesSpy).toHaveBeenCalledTimes(5);
    expect(await visibleBucketPaths(projectId)).toHaveLength(0);
  });
});
