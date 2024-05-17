import { createClient } from "@clickhouse/client";
import { env } from "../env";

export const clickhouseClient = createClient({
  url: env.CLICKHOUSE_URL ?? "http://localhost:8123",
  username: env.CLICKHOUSE_USER ?? "default",
  password: env.CLICKHOUSE_PASSWORD ?? "",
  database: "langfuse",
  clickhouse_settings: {
    async_insert: 1,
    wait_for_async_insert: 0,
  },
});
