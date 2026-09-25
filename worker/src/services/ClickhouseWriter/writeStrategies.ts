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
