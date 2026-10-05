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
import { configureOtelReplayEnvironment } from "./otelReplaySetup";

type OtelReplayStoredRow = Record<string, unknown>;

export type OtelReplayResult = {
  mode: OtelRawReplayMode;
  storedRows: OtelReplayStoredRow[];
  legacyRows?: Partial<Record<LegacyReplayTable, OtelReplayStoredRow[]>>;
  sideEffects?: unknown;
};

export type OtelRawReplayComparison = {
  originalTs: OtelReplayResult;
  earlyTs: OtelReplayResult;
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
  captureSideEffects?: () => unknown;
};

type OtelRawReplayMode = "original-ts" | "early-ts";

// The legacy processor caches its storage client. Keep this fake's identity stable
// across sequential replays, but release all file contents after each run.
const eventStorage = {
  source: undefined as
    | { path: string; bytes: Buffer; failLegacyDownloads?: boolean }
    | undefined,
  uploaded: new Map<string, string>(),
  async uploadJson(
    path: string,
    body: Record<string, unknown>[] | Record<string, unknown>,
  ) {
    eventStorage.uploaded.set(path, JSON.stringify(body));
  },
  read(path: string): Buffer {
    const uploaded = eventStorage.uploaded.get(path);
    if (uploaded !== undefined) {
      if (eventStorage.source?.failLegacyDownloads) {
        throw new Error("simulated legacy ingestion read failure");
      }
      return Buffer.from(uploaded);
    }
    if (path === eventStorage.source?.path) return eventStorage.source.bytes;
    throw new Error(`Replay event file not found: ${path}`);
  },
  // Only downloads need call recording: the harness asserts the selected raw-input path.
  download: vi.fn(async (path: string) =>
    eventStorage.read(path).toString("utf8"),
  ),
  downloadBytes: vi.fn(async (path: string) =>
    Uint8Array.from(eventStorage.read(path)),
  ),
  async listFiles(prefix: string) {
    return [...eventStorage.uploaded.keys()]
      .filter((path) => path.startsWith(prefix))
      .map((file) => ({ file, createdAt: new Date() }));
  },
};

const differentialClockFields = new Set([
  "created_at",
  "updated_at",
  "event_ts",
]);

export function comparableOtelReplayRows(
  rows: OtelReplayStoredRow[] = [],
): OtelReplayStoredRow[] {
  return rows
    .map((row) =>
      Object.fromEntries(
        Object.entries(row).filter(
          ([key]) => !differentialClockFields.has(key),
        ),
      ),
    )
    .sort((left, right) =>
      JSON.stringify(left).localeCompare(JSON.stringify(right)),
    );
}

export function expectRawOtelReplayParity(
  comparison: OtelRawReplayComparison,
): void {
  expect(comparableOtelReplayRows(comparison.earlyTs.storedRows)).toEqual(
    comparableOtelReplayRows(comparison.originalTs.storedRows),
  );
}

/** Replay identical unparsed bytes through the original and early-media TS paths. */
export async function runOtelReplayComparison(
  params: RunOtelReplayParams,
): Promise<OtelRawReplayComparison> {
  const { captureSideEffects, ...replayParams } = params;
  const originalTs = await runOneOtelReplay({
    ...replayParams,
    captureSideEffects,
    mode: "original-ts",
    bytes: Buffer.from(params.bytes),
  });
  const earlyTs = await runOneOtelReplay({
    ...replayParams,
    captureSideEffects,
    mode: "early-ts",
    bytes: Buffer.from(params.bytes),
  });

  return { originalTs, earlyTs };
}

/**
 * Replay an S3 OTEL document through the production queue and JSON writer, then
 * read its events_full rows from an isolated ClickHouse Memory table.
 */
export async function runOneOtelReplay(
  params: RunOtelReplayParams & { mode: OtelRawReplayMode },
): Promise<OtelReplayResult> {
  const projectId = params.projectId ?? "otel-replay-test";
  const fileKey = params.fileKey ?? "otel-replay/test.json";
  const writeMode = params.writeMode ?? "events_only";
  const client = clickhouseClient();
  const suffix = randomUUID().replaceAll("-", "");
  const tableName = `otel_replay_events_${suffix}`;
  const restoreEnvironment = configureOtelReplayEnvironment({
    mediaUploadEnabled: params.mediaUploadEnabled,
    overflowEnabled: params.overflowEnabled,
    overflowSizeLimitBytes: params.overflowSizeLimitBytes,
    earlyMediaExtractionEnabled: params.mode === "early-ts",
    writeMode,
  });

  eventStorage.source = {
    path: fileKey,
    bytes: Buffer.from(params.bytes),
    failLegacyDownloads: params.failLegacyQueueProcessing,
  };
  const storageClient = eventStorage as unknown as ReturnType<
    typeof getS3EventStorageClient
  >;
  const storageServiceSpy = vi
    .spyOn(StorageServiceFactory, "getInstance")
    .mockReturnValue(storageClient);

  const isolatedTableNames = new Map<TableName, string>([
    [TableName.EventsFull, tableName],
  ]);
  if (writeMode === "dual") {
    for (const legacyTable of legacyReplayTables) {
      isolatedTableNames.set(legacyTable, `${tableName}_${legacyTable}`);
    }
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
    vi.mocked(getS3EventStorageClient).mockReturnValue(storageClient);

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
            eventStorage.uploaded.has(
              `${bucketPrefix ?? ""}${queuedFileKey}.json`,
            )
          ) {
            pendingReplayJobAdds.push(pendingAdd);
          }
          return pendingAdd;
        });
        restoreQueueAddSpies.push(() => addSpy.mockRestore());
      }
    }

    await processor(job, undefined);
    if (params.mode === "original-ts") {
      expect(eventStorage.download).toHaveBeenCalledExactlyOnceWith(fileKey);
      expect(eventStorage.downloadBytes).not.toHaveBeenCalled();
    } else {
      expect(eventStorage.downloadBytes).toHaveBeenCalledExactlyOnceWith(
        fileKey,
      );
      expect(eventStorage.download).not.toHaveBeenCalled();
    }

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
      mode: params.mode,
      storedRows: (await result.json()) as OtelReplayStoredRow[],
      legacyRows,
      sideEffects: params.captureSideEffects?.(),
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
    storageServiceSpy.mockRestore();
    vi.mocked(getS3EventStorageClient).mockReset();
    eventStorage.download.mockClear();
    eventStorage.downloadBytes.mockClear();
    eventStorage.uploaded.clear();
    eventStorage.source = undefined;

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
