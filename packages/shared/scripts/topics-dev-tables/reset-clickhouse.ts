import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseEnv } from "node:util";
import { createClient } from "@clickhouse/client";

async function resetTopics() {
  const file = resolve(__dirname, "../../../../.env");
  // Match ch:down/ch:up: the local root .env overrides exported values.
  const config = {
    ...process.env,
    ...(existsSync(file) ? parseEnv(readFileSync(file, "utf8")) : {}),
  };
  const url = new URL(config.CLICKHOUSE_URL ?? "");
  if (
    !["http:", "https:"].includes(url.protocol) ||
    (url.pathname !== "/" && url.pathname !== "") ||
    url.search ||
    url.hash ||
    config.CLICKHOUSE_CLUSTER_ENABLED !== "false" ||
    !config.CLICKHOUSE_USER ||
    config.CLICKHOUSE_PASSWORD === undefined
  ) {
    throw new Error("Invalid single-node ClickHouse reset configuration.");
  }
  const database = config.CLICKHOUSE_DB || "default";
  console.log(
    `Resetting Topics tables: ${url.protocol}//${url.host}, database=${database}`,
  );
  const client = createClient({
    url: url.href,
    username: config.CLICKHOUSE_USER,
    password: config.CLICKHOUSE_PASSWORD,
    database,
  });
  try {
    // The explicit dev reset owns deletion; ordinary provisioning never drops tables.
    for (const table of [
      "topic_assignments",
      "topic_facet_summaries",
      "topics",
    ]) {
      await client.command({ query: `DROP TABLE IF EXISTS ${table} SYNC` });
    }
  } finally {
    await client.close();
  }
}

resetTopics().catch(() => {
  console.error(
    "Topics ClickHouse reset failed; check the local root .env, connectivity and permissions.",
  );
  process.exitCode = 1;
});
