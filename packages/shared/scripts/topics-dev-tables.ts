import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs, parseEnv } from "node:util";
import { createClient, type ClickHouseClient } from "@clickhouse/client";

const sharedDir = resolve(__dirname, "..");
const sqlDir = resolve(__dirname, "topics-dev-tables");

class SetupError extends Error {}

function statements(file: string) {
  // These checked-in DDL files contain no semicolons in literals or comments.
  return readFileSync(resolve(sqlDir, file), "utf8")
    .replace(/^--.*$/gm, "")
    .split(";")
    .map((sql) => sql.trim())
    .filter((sql) => sql && sql !== "BEGIN" && sql !== "COMMIT");
}

function mismatch(table: string, detail: string): never {
  throw new SetupError(
    `${table}: incompatible ${detail}. No automatic upgrades; reconcile the schema explicitly.`,
  );
}

async function checkClickhouse(db: ClickHouseClient, sql: string[]) {
  const result = await db.query({
    query:
      "SELECT name, create_table_query FROM system.tables WHERE database = currentDatabase() AND name IN {names:Array(String)}",
    query_params: {
      names: sql.map(
        (statement) => statement.match(/^CREATE TABLE IF NOT EXISTS (\w+)/)![1],
      ),
    },
    format: "JSONEachRow",
  });
  const tables = await result.json<{
    name: string;
    create_table_query: string;
  }>();
  const missing: string[] = [];
  for (const statement of sql) {
    const name = statement.match(/^CREATE TABLE IF NOT EXISTS (\w+)/)![1]!;
    const table = tables.find((item) => item.name === name);
    if (!table) {
      missing.push(name);
      continue;
    }
    // Projection maintenance is required for correct replacement and deletion.
    for (const setting of [
      "deduplicate_merge_projection_mode",
      "lightweight_mutation_projection_mode",
    ]) {
      const expected = `${setting} = 'rebuild'`;
      if (
        statement.includes(expected) &&
        !table.create_table_query.includes(expected)
      )
        mismatch(name, `setting ${setting}`);
    }
    // Cloud manages replication and rewrites MergeTree to SharedMergeTree.
    // Compare the remaining schema, including constraints, keys and version column.
    const normalize = (query: string) =>
      query
        .replace(
          /^CREATE TABLE (?:IF NOT EXISTS )?[^\s(]+/,
          "CREATE TABLE topics_schema",
        )
        .replace(
          /SharedReplacingMergeTree\('[^']*', '[^']*', /,
          "ReplacingMergeTree(",
        )
        .replace(/\s+SETTINGS [\s\S]*$/, "");
    const formatted = await db.query({
      query:
        "SELECT formatQuery({expected:String}) AS expected, formatQuery({actual:String}) AS actual",
      query_params: {
        expected: normalize(statement),
        actual: normalize(table.create_table_query),
      },
      format: "JSONEachRow",
    });
    const [schema] = await formatted.json<{
      expected: string;
      actual: string;
    }>();
    if (schema?.expected !== schema?.actual)
      mismatch(name, "ClickHouse definition");
  }
  return missing;
}

async function main() {
  const { values, positionals } = parseArgs({
    options: {
      config: { type: "string" },
      apply: { type: "boolean" },
      check: { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
    allowPositionals: true,
  });
  if (values.help) {
    console.log(`Usage: pnpm run topics:dev-tables [clickhouse] [--config /path/to/staging.env] [--apply|--check]
Checks ClickHouse schemas by default. --apply creates missing ClickHouse tables.
Postgres tables are managed by normal Prisma migrations.
An explicit env file is the sole source of database configuration; otherwise root .env plus exported variables are used.
ClickHouse uses CLICKHOUSE_URL (HTTP/HTTPS), not CLICKHOUSE_MIGRATION_URL. Self-managed clustered ClickHouse is unsupported.`);
    return;
  }
  const target = positionals[0] ?? "clickhouse";
  if (
    positionals.length > 1 ||
    target !== "clickhouse" ||
    (values.apply && values.check)
  ) {
    throw new SetupError("Invalid arguments. Use --help.");
  }
  const envFile = values.config;
  const defaultFile = resolve(sharedDir, "../../.env");
  const config = envFile
    ? parseEnv(readFileSync(resolve(sharedDir, "../..", envFile), "utf8"))
    : {
        ...(existsSync(defaultFile)
          ? parseEnv(readFileSync(defaultFile, "utf8"))
          : {}),
        ...process.env,
      };
  const required = (key: string, allowEmpty = false) => {
    const value = config[key];
    if (value === undefined || (!allowEmpty && !value))
      throw new SetupError(`${key} must be set in the selected environment.`);
    return value;
  };
  let clickhouse: ClickHouseClient | undefined;
  const clickhouseSql = statements("clickhouse.sql");
  try {
    if (![undefined, "false"].includes(config.CLICKHOUSE_CLUSTER_ENABLED)) {
      throw new SetupError(
        "This script supports single-node ClickHouse and ClickHouse Cloud (CLICKHOUSE_CLUSTER_ENABLED=false). Self-managed clusters require explicit replicated provisioning.",
      );
    }
    const url = new URL(required("CLICKHOUSE_URL"));
    if (!["http:", "https:"].includes(url.protocol))
      throw new SetupError("CLICKHOUSE_URL requires HTTP or HTTPS.");
    if (
      (url.pathname !== "/" && url.pathname !== "") ||
      url.search ||
      url.hash
    ) {
      throw new SetupError(
        "CLICKHOUSE_URL must contain only the server origin; set the database with CLICKHOUSE_DB, not a URL path or query.",
      );
    }
    const database = envFile
      ? required("CLICKHOUSE_DB")
      : config.CLICKHOUSE_DB || "default";
    console.log(
      `ClickHouse: ${url.protocol}//${url.host}, database=[REDACTED]`,
    );
    clickhouse = createClient({
      url: url.href,
      username: required("CLICKHOUSE_USER"),
      password: required("CLICKHOUSE_PASSWORD", true),
      database,
      request_timeout: 30_000,
    });
    const missingClickhouse = await checkClickhouse(clickhouse, clickhouseSql);
    console.log(`Missing ClickHouse tables: [${missingClickhouse.join(", ")}]`);
    if (!values.apply) {
      console.log(
        "Preflight passed; no changes made. Use --apply to create missing tables.",
      );
      return;
    }
    for (const statement of clickhouseSql) {
      if (
        missingClickhouse.includes(
          statement.match(/^CREATE TABLE IF NOT EXISTS (\w+)/)![1]!,
        )
      ) {
        await clickhouse.command({ query: statement });
      }
    }
    const remainingClickhouse = await checkClickhouse(
      clickhouse,
      clickhouseSql,
    );
    if (remainingClickhouse.length)
      throw new SetupError("Tables still missing after provisioning.");
    console.log(
      "Topics tables ready; schemas verified. No data seeded or deleted.",
    );
  } finally {
    await clickhouse?.close();
  }
}

main().catch((error: unknown) => {
  // Driver errors can contain credentials or connection URLs. Print only our own diagnostics.
  console.error(
    error instanceof SetupError
      ? error.message
      : "Database operation failed. Check connectivity, permissions and server logs. Provisioning may be partial; rerun preflight before retrying.",
  );
  process.exitCode = 1;
});
