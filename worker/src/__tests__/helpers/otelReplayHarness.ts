import { randomUUID } from "node:crypto";

import { expect, vi } from "vitest";
import type { Job } from "bullmq";

import {
  clickhouseClient,
  getS3EventStorageClient,
  IngestionQueue,
  QueueJobs,
  QueueName,
  StorageServiceFactory,
  type ClickhouseClientType,
  type TQueueJobTypes,
} from "@langfuse/shared/src/server";

import { ClickhouseWriter, TableName } from "../../services/ClickhouseWriter";
import { otelIngestionQueueProcessorBuilder } from "../../queues/otelIngestionQueue";
import { ingestionQueueProcessorBuilder } from "../../queues/ingestionQueue";
import {
  configureOtelReplayEnvironment,
  otelReplayMocks,
} from "./otelReplaySetup";

type OtelReplayStoredRow = Record<string, unknown>;

export type OtelReplayResult = {
  storedRows: OtelReplayStoredRow[];
  legacyRows?: Partial<Record<LegacyReplayTable, OtelReplayStoredRow[]>>;
};

type LegacyReplayTable =
  | TableName.Traces
  | TableName.Observations
  | TableName.ObservationsBatchStaging;

type IngestionQueueJob = Job<TQueueJobTypes[QueueName.IngestionQueue]>;

const legacyReplayTables: LegacyReplayTable[] = [
  TableName.Traces,
  TableName.Observations,
  TableName.ObservationsBatchStaging,
];

type RunOtelReplayParams = {
  /** The exact S3 document bytes passed to the production queue processor. */
  bytes: Buffer;
  projectId?: string;
  orgId?: string;
  fileKey?: string;
  mediaUploadEnabled?: boolean;
  overflowEnabled?: boolean;
  overflowSizeLimitBytes?: number;
  writeMode?: "events_only" | "dual";
  failLegacyQueueProcessing?: boolean;
};

/**
 * Replay an S3 OTEL document through the production queue and JSON writer, then
 * read its events_full rows from an isolated ClickHouse Memory table.
 */
export async function runOtelReplay(
  params: RunOtelReplayParams,
): Promise<OtelReplayResult> {
  const projectId = params.projectId ?? "otel-replay-test";
  const fileKey = params.fileKey ?? "otel-replay/test.json";
  const writeMode = params.writeMode ?? "events_only";
  const client = clickhouseClient();
  const suffix = randomUUID().replaceAll("-", "");
  const tableName = `otel_replay_events_${suffix}`;
  const originalBytes = Buffer.from(params.bytes);
  const restoreEnvironment = configureOtelReplayEnvironment({
    mediaUploadEnabled: params.mediaUploadEnabled,
    overflowEnabled: params.overflowEnabled,
    overflowSizeLimitBytes: params.overflowSizeLimitBytes,
    writeMode,
  });

  const uploadedEventJson = new Map<string, string>();
  let storageDownloadCount = 0;
  const storage = {
    download: vi.fn(async (path?: string) => {
      storageDownloadCount += 1;
      if (params.failLegacyQueueProcessing && storageDownloadCount > 1) {
        throw new Error("simulated legacy ingestion read failure");
      }
      const uploaded = path ? uploadedEventJson.get(path) : undefined;
      return uploaded ?? Buffer.from(originalBytes).toString("utf8");
    }),
    listFiles: vi.fn(async (prefix: string) =>
      [...uploadedEventJson.keys()]
        .filter((path) => path.startsWith(prefix))
        .map((file) => ({ file, createdAt: new Date() })),
    ),
  };
  const storageServiceSpy =
    writeMode === "dual"
      ? vi.spyOn(StorageServiceFactory, "getInstance").mockReturnValue({
          uploadJson: otelReplayMocks.uploadEventJson,
        } as never)
      : undefined;

  const isolatedTableNames = new Map<TableName, string>([
    [TableName.EventsFull, tableName],
  ]);
  if (writeMode === "dual") {
    for (const legacyTable of legacyReplayTables) {
      isolatedTableNames.set(legacyTable, `${tableName}_${legacyTable}`);
    }
    otelReplayMocks.uploadEventJson.mockImplementation(
      async (path: string, body: Record<string, unknown>[]) => {
        uploadedEventJson.set(path, JSON.stringify(body));
      },
    );
  }

  const createdTables: string[] = [];
  const pendingReplayJobAdds: Promise<IngestionQueueJob>[] = [];
  const restoreQueueAddSpies: Array<() => void> = [];
  let unmappedInsertError: Error | undefined;
  let writer: ReturnType<typeof ClickhouseWriter.getInstance> | undefined;
  let replayResult: OtelReplayResult | undefined;
  let primaryError: Error | undefined;
  const cleanupErrors: unknown[] = [];

  try {
    vi.mocked(getS3EventStorageClient).mockReturnValue(
      storage as unknown as ReturnType<typeof getS3EventStorageClient>,
    );

    for (const [sourceTable, isolatedTable] of isolatedTableNames) {
      await client.command({
        query: `CREATE TABLE ${isolatedTable} AS ${sourceTable} ENGINE = Memory`,
      });
      createdTables.push(isolatedTable);
    }

    const insert = async (
      insertParams: Parameters<ClickhouseClientType["insert"]>[0],
    ) => {
      const isolatedTable = isolatedTableNames.get(
        insertParams.table as TableName,
      );
      if (!isolatedTable) {
        const sourceTable = String(insertParams.table);
        const error = new Error(
          `OTEL replay attempted an insert into unmapped ClickHouse table ${sourceTable}`,
        );
        if (!unmappedInsertError) unmappedInsertError = error;
        throw error;
      }

      return client.insert({ ...insertParams, table: isolatedTable });
    };
    const testClient = new Proxy(client, {
      get(target, property, receiver) {
        if (property === "insert") return insert;
        return Reflect.get(target, property, receiver);
      },
    });

    await ClickhouseWriter.shutdownAll();
    writer = ClickhouseWriter.getInstance(testClient);

    const processor = otelIngestionQueueProcessorBuilder(false);
    const job = {
      data: {
        id: `otel-replay-${suffix}`,
        timestamp: new Date(),
        name: QueueJobs.OtelIngestionJob,
        payload: {
          data: { fileKey },
          authCheck: {
            validKey: true,
            scope: {
              projectId,
              orgId: params.orgId ?? "otel-replay-org",
              accessLevel: "project",
            },
          },
          ingestionVersion: "4",
          sdkName: "otel-replay",
          sdkVersion: "test",
        },
      },
    } as Job<TQueueJobTypes[QueueName.OtelIngestionQueue]>;

    if (writeMode === "dual") {
      for (const shardName of IngestionQueue.getShardNames()) {
        const queue = IngestionQueue.getInstance({ shardName });
        if (!queue) continue;

        const originalAdd = queue.add.bind(queue);
        const addSpy = vi.spyOn(queue, "add");
        addSpy.mockImplementation((...args) => {
          const { payload } = args[1];
          const { bucketPrefix, fileKey: queuedFileKey } = payload.data;
          const pendingAdd = originalAdd(...args);
          // Preserve the real queue add; own only this replay's uploaded files.
          if (
            payload.authCheck.scope.projectId === projectId &&
            uploadedEventJson.has(`${bucketPrefix ?? ""}${queuedFileKey}.json`)
          ) {
            pendingReplayJobAdds.push(pendingAdd);
          }
          return pendingAdd;
        });
        restoreQueueAddSpies.push(() => addSpy.mockRestore());
      }
    }

    await processor(job, undefined);
    expect(storage.download).toHaveBeenCalledOnce();

    if (writeMode === "dual") {
      const legacyProcessor = ingestionQueueProcessorBuilder(false);
      for (const legacyJob of await Promise.all(pendingReplayJobAdds)) {
        await legacyProcessor(legacyJob, undefined);
      }
    }

    await ClickhouseWriter.shutdownAll();
    for (const table of isolatedTableNames.keys()) {
      const pendingRows = writer.queue[table].length;
      if (pendingRows > 0) {
        throw new Error(
          `ClickHouse replay retained ${pendingRows} ${table} rows after shutdown`,
        );
      }
    }

    const result = await client.query({
      query: `
        SELECT *
        FROM ${tableName}
        ORDER BY trace_id, span_id
        SETTINGS asterisk_include_materialized_columns = 1,
          asterisk_include_alias_columns = 1
      `,
      format: "JSONEachRow",
    });
    const legacyRows =
      writeMode === "dual"
        ? Object.fromEntries(
            await Promise.all(
              legacyReplayTables.map(async (table) => {
                const legacyResult = await client.query({
                  query: `SELECT * FROM ${isolatedTableNames.get(table)}`,
                  format: "JSONEachRow",
                });
                return [
                  table,
                  (await legacyResult.json()) as OtelReplayStoredRow[],
                ];
              }),
            ),
          )
        : undefined;

    replayResult = {
      storedRows: (await result.json()) as OtelReplayStoredRow[],
      legacyRows,
    };
  } catch (error) {
    primaryError = new Error(
      `OTEL replay failed for ClickHouse table ${tableName}: ${formatUnknownError(error)}`,
      { cause: error },
    );
  } finally {
    restoreEnvironment();
    const replayJobAdds = await Promise.allSettled(pendingReplayJobAdds);
    for (const restoreQueueAddSpy of restoreQueueAddSpies) {
      restoreQueueAddSpy();
    }
    const queueCleanupResults = await Promise.allSettled(
      replayJobAdds
        .filter(
          (result): result is PromiseFulfilledResult<IngestionQueueJob> =>
            result.status === "fulfilled",
        )
        .map(({ value: job }) => job.remove()),
    );
    for (const result of queueCleanupResults) {
      if (result.status === "rejected") cleanupErrors.push(result.reason);
    }
    storageServiceSpy?.mockRestore();
    vi.mocked(getS3EventStorageClient).mockReset();
    otelReplayMocks.uploadEventJson.mockReset();
    otelReplayMocks.uploadEventJson.mockResolvedValue(undefined);

    try {
      await ClickhouseWriter.shutdownAll();
    } catch (error) {
      cleanupErrors.push(error);
    }
    if (unmappedInsertError) {
      cleanupErrors.push(unmappedInsertError);
    }
    if (createdTables.length > 0) {
      try {
        await Promise.all(
          createdTables.map((table) =>
            client.command({ query: `DROP TABLE IF EXISTS ${table}` }),
          ),
        );
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
  }

  if (cleanupErrors.length > 0) {
    throw new AggregateError(
      primaryError ? [primaryError, ...cleanupErrors] : cleanupErrors,
      primaryError
        ? `OTEL replay cleanup failed after ${tableName}`
        : `OTEL replay cleanup failed for ${tableName}`,
    );
  }
  if (primaryError) throw primaryError;
  if (!replayResult) {
    throw new Error(`OTEL replay produced no result for ${tableName}`);
  }
  return replayResult;
}

function formatUnknownError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
