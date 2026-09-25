import type { ClickhouseClientType } from "@langfuse/shared/src/server";
import type { RecordInsertType, TableName } from "./index";

export type ClickhouseWriteStrategy<Row> = {
  write(
    client: ClickhouseClientType,
    params: {
      table: string;
      records: Row[];
      clickhouse_settings: { log_comment: string };
    },
  ): Promise<void>;
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
};
