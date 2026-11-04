import { logger, type ClickhouseClientType } from "@langfuse/shared/src/server";

let computesEventBytes = false;

export const clickhouseComputesEventBytes = (): boolean => computesEventBytes;

export async function initializeEventByteAccounting(
  client: ClickhouseClientType,
): Promise<void> {
  computesEventBytes = false;
  try {
    const result = await client.query({
      query: "DESCRIBE TABLE {table: Identifier}",
      query_params: { table: "events_full" },
      format: "JSONEachRow",
    });
    const columns = await result.json<{
      name: string;
      default_type: string;
      default_expression: string;
    }>();
    const column = columns.find((column) => column.name === "event_bytes");
    computesEventBytes =
      column?.default_type === "DEFAULT" &&
      column.default_expression.startsWith("byteSize(");
    if (!computesEventBytes) {
      logger.warn(
        "ClickHouse event-size DEFAULT is unavailable; using legacy estimates for TypeScript writers",
      );
    }
  } catch (error) {
    logger.warn(
      "Failed to detect ClickHouse event-size DEFAULT; using legacy estimates for TypeScript writers",
      { error: error instanceof Error ? error.message : String(error) },
    );
  }
}
