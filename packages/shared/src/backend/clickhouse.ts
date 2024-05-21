import { createClient } from "@clickhouse/client";
import { env } from "../env";
import { observationRecord } from "./definitions";
import z from "zod";

export const clickhouseClient = createClient({
  url: env.CLICKHOUSE_URL ?? "http://localhost:8123",
  username: env.CLICKHOUSE_USER ?? "default",
  password: env.CLICKHOUSE_PASSWORD ?? "",
  database: "langfuse",
  clickhouse_settings: {
    async_insert: 1,
    wait_for_async_insert: 1, // if disabled, we wont get errors from clickhouse
  },
});
