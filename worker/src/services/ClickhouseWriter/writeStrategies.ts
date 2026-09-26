import { Readable } from "node:stream";

import {
  encodeClickhouseEvents,
  type NativeEventBlock,
  type PreparedEvent,
} from "@langfuse/native";
import type { ClickhouseClientType } from "@langfuse/shared/src/server";

import type { RecordInsertType, TableName } from "./types";
import { clampDecimal64Fields, truncateOversizedRecord } from "./jsonRecords";

export type ClickhouseWriteStrategy<Row> = {
  write(
    client: ClickhouseClientType,
    params: {
      table: string;
      records: Row[];
      clickhouse_settings: { log_comment: string };
    },
  ): Promise<void>;
  prepare?<R extends Row>(table: TableName, row: R): R;
  truncate?<R extends Row>(table: TableName, row: R): R;
  droppedId(row: Row): {
    project_id: string;
    trace_id: string | null | undefined;
    id: string;
  };
};

export const jsonWriteStrategy: ClickhouseWriteStrategy<
  RecordInsertType<TableName>
> = {
  write(client, { table, records, clickhouse_settings }) {
    return client
      .insert({
        table,
        format: "JSONEachRow",
        values: records,
        clickhouse_settings,
      })
      .then(() => {});
  },
  prepare: clampDecimal64Fields,
  truncate: truncateOversizedRecord,
  droppedId(record) {
    return {
      project_id: record.project_id,
      trace_id:
        ("trace_id" in record ? record.trace_id : undefined) ?? record.id,
      id: record.id,
    };
  },
};

const MAX_NATIVE_RESPONSE_EXCERPT_LENGTH = 4096;

/**
 * Encode one selected row batch once, then send the owned buffers on every transport attempt.
 * Requeued rows are deliberately encoded again when they enter a later flush.
 */
export function createNativeWriteStrategy(): ClickhouseWriteStrategy<PreparedEvent> {
  let encodedBlocks: Promise<NativeEventBlock[]> | undefined;

  return {
    async write(client, { table, records: events, clickhouse_settings }) {
      if (!encodedBlocks) {
        encodedBlocks = encodeClickhouseEvents(events, events.length);
      }
      const blocks = await encodedBlocks;
      const response = await client.exec({
        query: `INSERT INTO ${table} FORMAT Native`,
        // Each attempt consumes its own stream cursor. The queued buffers remain reusable.
        values: Readable.from(
          blocks.map((block) => block.bytes),
          { objectMode: false },
        ),
        clickhouse_settings: {
          ...clickhouse_settings,
          // Ask ClickHouse to finish the insert before sending response headers.
          wait_end_of_query: 1,
        },
      });

      // Successful Native INSERTs return no body. exec() checks status/headers, but does not
      // parse late exceptions in the raw HTTP 200 response body. Drain it fully and retain
      // only a short error excerpt for the writer's retry/requeue path.
      let responseExcerpt = "";
      // Decode across chunk boundaries so split UTF-8 characters remain intact.
      for await (const chunk of response.stream.setEncoding("utf8")) {
        const remainingLength =
          MAX_NATIVE_RESPONSE_EXCERPT_LENGTH - responseExcerpt.length;
        if (remainingLength <= 0) continue;

        responseExcerpt += chunk.slice(0, remainingLength);
      }

      // The length cap counts UTF-16 units; do not log half of a truncated astral character.
      responseExcerpt = responseExcerpt.replace(/[\uD800-\uDBFF]$/, "");
      if (responseExcerpt.length > 0) {
        throw new Error(
          `ClickHouse Native insert returned a non-empty response body: ${responseExcerpt}`,
        );
      }
    },
    droppedId(payload) {
      return payload.ids;
    },
  };
}
