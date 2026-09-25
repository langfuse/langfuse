import { randomUUID } from "node:crypto";

import {
  clickhouseClient,
  type ClickhouseClientType,
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

type OtelReplayResult = {
  storedRows: OtelReplayStoredRow[];
};

/**
 * Runs the production OTEL event phase through the production writer and reads
 * the rows persisted in an isolated Memory table.
 */
export async function runOtelReplay(
  params: RunOtelReplayParams,
): Promise<OtelReplayResult> {
  const projectId = params.projectId ?? "otel-replay-test";
  const fileKey = params.fileKey ?? "otel-replay/test.json";
  const client = clickhouseClient();
  const suffix = randomUUID().replaceAll("-", "");
  const tableName = `otel_replay_events_${suffix}`;
  let writer: ClickhouseWriter | undefined;
  let tableCreated = false;
  let writerShutdown = false;

  try {
    await client.command({
      query: `CREATE TABLE ${tableName} AS events_full ENGINE = Memory`,
    });
    tableCreated = true;

    writer = ClickhouseWriter.getInstance({
      insert: async (params: Parameters<ClickhouseClientType["insert"]>[0]) =>
        client.insert({
          ...params,
          table:
            params.table === TableName.EventsFull ? tableName : params.table,
        }),
    } as ClickhouseClientType);

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
      writer,
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

    // Reset the singletons here so cleanup cannot retry rows retained by this drain.
    await ClickhouseWriter.shutdownAll();
    writerShutdown = true;

    const pendingRows = writer.queue[TableName.EventsFull].length;
    if (pendingRows > 0) {
      throw new Error(
        `ClickHouse replay writer retained ${pendingRows} EventsFull rows after shutdown`,
      );
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

    return {
      storedRows: (await result.json()) as OtelReplayStoredRow[],
    };
  } catch (error) {
    throw new Error(
      `OTEL replay harness failed for ClickHouse table ${tableName}: ${formatUnknownError(error)}`,
      { cause: error },
    );
  } finally {
    try {
      if (writer && !writerShutdown) {
        // Each corpus replay needs a fresh singleton and interval timer.
        await ClickhouseWriter.shutdownAll();
      }
    } finally {
      if (tableCreated) {
        await client.command({ query: `DROP TABLE IF EXISTS ${tableName}` });
      }
    }
  }
}

function formatUnknownError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
