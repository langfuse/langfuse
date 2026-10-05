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
  const storage = {
    download: vi.fn(async (path?: string) => {
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
    ) =>
      client.insert({
        ...insertParams,
        table:
          isolatedTableNames.get(insertParams.table as TableName) ??
          insertParams.table,
      });
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

    await processor(job, undefined);
    expect(storage.download).toHaveBeenCalledOnce();

    if (writeMode === "dual") {
      // The OTEL processor hands retained legacy writes to the normal queue.
      // Those jobs have generated S3 keys, so the replay's unique project ID
      // scopes the drain before the writes land in the isolated tables.
      const legacyProcessor = ingestionQueueProcessorBuilder(false);
      for (const shardName of IngestionQueue.getShardNames()) {
        const queue = IngestionQueue.getInstance({ shardName });
        if (!queue) continue;
        const jobs = await queue.getJobs(["waiting", "delayed", "prioritized"]);
        for (const legacyJob of jobs.filter(
          (candidate) =>
            candidate.data.payload.authCheck.scope.projectId === projectId,
        )) {
          await legacyProcessor(legacyJob, undefined);
          await legacyJob.remove();
        }
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
    storageServiceSpy?.mockRestore();
    vi.mocked(getS3EventStorageClient).mockReset();
    otelReplayMocks.uploadEventJson.mockReset();
    otelReplayMocks.uploadEventJson.mockResolvedValue(undefined);

    try {
      await ClickhouseWriter.shutdownAll();
    } catch (error) {
      cleanupErrors.push(error);
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
