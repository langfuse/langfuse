import { createClient } from "@clickhouse/client";

import { env } from "../env";

export type ClickhouseClientType = ReturnType<typeof createClient>;

export const clickhouseClient = createClient({
  url: env.CLICKHOUSE_URL,
  username: env.CLICKHOUSE_USER,
  password: env.CLICKHOUSE_PASSWORD,
  database: "default",
  clickhouse_settings: {
    async_insert: 1,
    wait_for_async_insert: 1, // if disabled, we won't get errors from clickhouse
  },
});
