import { randomUUID } from "node:crypto";

import {
  clickhouseClient,
  type ClickhouseClientType,
  type EventRecordInsertType,
  type ResourceSpan,
  OtelIngestionProcessor,
} from "@langfuse/shared/src/server";

import { ClickhouseWriter, TableName } from "../../services/ClickhouseWriter";
import { IngestionService } from "../../services/IngestionService";
import { processOtelEvents } from "../../features/otel-ingestion/processOtelEvents";

type OtelReplayStoredRow = Record<string, unknown>;

type RunOtelReplayParams = {
  resourceSpans: ResourceSpan[];
  projectId?: string;
  fileKey?: string;
};

type WriterStatics = {
  instance: ClickhouseWriter | null;
  client: ClickhouseClientType | null;
};

type OtelReplayClickhouseSink = {
  writer: ClickhouseWriter;
  flushAndRead: () => Promise<OtelReplayStoredRow[]>;
  cleanup: () => Promise<void>;
};

type OtelReplayResult = {
  queuedRows: EventRecordInsertType[];
  storedRows: OtelReplayStoredRow[];
};

let replayRunning = false;

/**
 * Creates an isolated Memory table with the production events_full schema and
 * routes only EventsFull writes through it.  The writer remains the real
 * ClickhouseWriter, including its JSONEachRow serialization and Decimal64
 * clamping.
 */
async function createOtelReplayClickhouseSink(): Promise<OtelReplayClickhouseSink> {
  const client = clickhouseClient();
  const suffix = randomUUID().replaceAll("-", "");
  const tableName = `otel_replay_events_${suffix}`;
  const writerStatics = ClickhouseWriter as unknown as WriterStatics;
  const previousInstance = writerStatics.instance;
  const previousClient = writerStatics.client;
  // The writer has process-wide state. Never redirect an existing writer or
  // overlap two replays within a test file; Vitest isolates files separately.
  if (replayRunning || previousInstance) {
    throw new Error("OTEL replay requires an isolated, idle ClickhouseWriter");
  }
  replayRunning = true;
  const restoreWriterStatics = () => {
    writerStatics.instance = previousInstance;
    writerStatics.client = previousClient;
    replayRunning = false;
  };

  let tableCreated = false;
  let closed = false;
  const failedInserts: unknown[] = [];

  try {
    await client.command({
      query: `CREATE TABLE ${tableName} AS events_full ENGINE = Memory`,
    });
    tableCreated = true;

    const writerClient: ClickhouseClientType = {
      insert: async (params: Parameters<ClickhouseClientType["insert"]>[0]) => {
        try {
          if (String(params.table) !== TableName.EventsFull) {
            throw new Error(
              `OTEL replay sink rejected unexpected ClickHouse table ${String(params.table)}`,
            );
          }
          if (!Array.isArray(params.values)) {
            throw new Error(
              "OTEL replay sink requires array JSONEachRow values",
            );
          }

          return await client.insert({
            ...params,
            table: tableName,
          });
        } catch (error) {
          failedInserts.push(error);
          throw error;
        }
      },
    } as ClickhouseClientType;

    const writer = ClickhouseWriter.getInstance(writerClient);
    if (writer.intervalId) {
      clearInterval(writer.intervalId);
      writer.intervalId = null;
    }
    writer.batchSize = Number.MAX_SAFE_INTEGER;

    const readRows = async (): Promise<OtelReplayStoredRow[]> => {
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
      return (await result.json()) as OtelReplayStoredRow[];
    };

    const flushAndRead = async () => {
      await writer.flushAll(true);

      if (failedInserts.length > 0) {
        throw new Error(
          `ClickHouse replay insert failed: ${formatUnknownError(failedInserts[0])}`,
        );
      }

      const pendingRows = writer.queue[TableName.EventsFull].length;
      if (pendingRows > 0) {
        throw new Error(
          `ClickHouse replay writer retained ${pendingRows} EventsFull rows after flush`,
        );
      }

      return readRows();
    };

    const cleanup = async () => {
      if (closed) return;
      closed = true;

      try {
        // A successful test has no queued rows.  Clear a failed queue before
        // shutdown so ClickhouseWriter cannot hide a second failure while
        // cleanup is running.
        for (const queue of Object.values(writer.queue)) queue.length = 0;
        await writer.shutdown();
        if (tableCreated) {
          await client.command({ query: `DROP TABLE IF EXISTS ${tableName}` });
        }
      } finally {
        // clickhouseClient() is a process-wide cached client.  Do not close it
        // here; other suites may be using the same manager entry.
        restoreWriterStatics();
      }
    };

    return {
      writer,
      flushAndRead,
      cleanup,
    };
  } catch (error) {
    if (tableCreated) {
      await client
        .command({ query: `DROP TABLE IF EXISTS ${tableName}` })
        .catch(() => undefined);
    }
    restoreWriterStatics();
    throw new Error(
      `OTEL replay harness could not connect to or prepare ClickHouse (table ${tableName}): ${formatUnknownError(error)}`,
      { cause: error },
    );
  }
}

/** Snapshot the records before ClickhouseWriter's Decimal64 clamping mutates them. */
function snapshotQueuedOtelRows(
  writer: ClickhouseWriter,
): EventRecordInsertType[] {
  return writer.queue[TableName.EventsFull].map(({ data }) =>
    structuredClone(data),
  );
}

/**
 * Runs the extracted production OTEL path against the isolated sink.  The
 * table is flushed and read before cleanup, so a successful return always
 * contains rows accepted by ClickHouse rather than merely rows accepted by
 * ClickhouseWriter's in-memory queue.
 */
export async function runOtelReplay(
  params: RunOtelReplayParams,
): Promise<OtelReplayResult> {
  const projectId = params.projectId ?? "otel-replay-test";
  const fileKey = params.fileKey ?? "otel-replay/test.json";
  const sink = await createOtelReplayClickhouseSink();

  try {
    const processor = new OtelIngestionProcessor({
      projectId,
      publicKey: "",
      sdkName: "otel-replay",
      sdkVersion: "test",
      fileKey,
    });
    const ingestionService = new IngestionService(
      {} as never,
      {} as never,
      sink.writer,
      {} as never,
    );

    await processOtelEvents({
      processor,
      resourceSpans: params.resourceSpans,
      ingestionService,
      projectId,
      fileKey,
      shouldWriteToEventsTable: true,
    });
    const queuedRows = snapshotQueuedOtelRows(sink.writer);
    const storedRows = await sink.flushAndRead();
    return { queuedRows, storedRows };
  } finally {
    await sink.cleanup();
  }
}

function formatUnknownError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
