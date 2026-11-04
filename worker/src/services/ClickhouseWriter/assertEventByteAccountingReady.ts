import type { ClickhouseClientType } from "@langfuse/shared/src/server";

export async function assertEventByteAccountingReady(
  client: ClickhouseClientType,
): Promise<void> {
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
  if (
    column?.default_type !== "DEFAULT" ||
    !column.default_expression.startsWith("byteSize(")
  ) {
    throw new Error(
      "Run ClickHouse migrations before starting the worker: events_full.event_bytes requires a byteSize DEFAULT.",
    );
  }
}
