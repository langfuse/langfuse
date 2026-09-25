import type { ClickhouseClientType } from "@langfuse/shared/src/server";

export type ClickhouseWriteStrategy = {
  /** JSON-only repair retries can split or truncate the records passed to write(). */
  readonly supportsJsonRepair: boolean;
  write(payload: ReadonlyArray<unknown>): Promise<number>;
  droppedId(payload: unknown): {
    project_id: unknown;
    trace_id: unknown;
    id: unknown;
  };
};

export type StrategyParams = {
  getClient: () => ClickhouseClientType;
  table: string;
  clickhouseSettings: { log_comment: string };
};

/** Send the current rows as JSONEachRow. The writer may replace rows between attempts. */
export function createJsonWriteStrategy(
  params: StrategyParams,
): ClickhouseWriteStrategy {
  return {
    supportsJsonRepair: true,
    write(records) {
      return params
        .getClient()
        .insert({
          table: params.table,
          format: "JSONEachRow",
          values: records as Record<string, unknown>[],
          clickhouse_settings: params.clickhouseSettings,
        })
        .then(() => records.length);
    },
    droppedId(payload) {
      const record = payload as Record<string, unknown>;
      return {
        project_id: record.project_id,
        trace_id: record.trace_id ?? record.id,
        id: record.id,
      };
    },
  };
}
