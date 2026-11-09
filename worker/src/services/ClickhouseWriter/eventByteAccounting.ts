import { clickhouseClient, logger } from "@langfuse/shared/src/server";

let computesEventBytes = false;

export const clickhouseComputesEventBytes = (): boolean => computesEventBytes;

export async function initializeEventByteAccounting(): Promise<void> {
  computesEventBytes = false;
  try {
    const result = await clickhouseClient().query({
      query: "DESCRIBE TABLE events_full",
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
  } catch (error) {
    logger.warn(
      "Failed to detect ClickHouse event-size DEFAULT; using legacy estimates for TypeScript writers",
      { error: error instanceof Error ? error.message : String(error) },
    );
  }
}
