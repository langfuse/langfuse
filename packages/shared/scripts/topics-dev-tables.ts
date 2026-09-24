import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs, parseEnv } from "node:util";
import { PrismaClient } from "@prisma/client";
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

function normalizePostgres(sql: string) {
  return sql
    .replace(/"/g, "")
    .replace(/\bIF NOT EXISTS\s+/gi, "")
    .replace(/\bUSING btree\s+/gi, "")
    .replace(
      /ON DELETE CASCADE ON UPDATE CASCADE/gi,
      "ON UPDATE CASCADE ON DELETE CASCADE",
    )
    .replace(/('[^']*')::(?:text|jsonb)\b(?!\[)/gi, "$1")
    .replace(/TIMESTAMPTZ\((\d+)\)/gi, "timestamp($1) with time zone")
    .split(/('(?:''|[^'])*')/g)
    .map((part, index) =>
      index % 2 ? part : part.replace(/\s+/g, "").toLowerCase(),
    )
    .join("");
}

function mismatch(table: string, detail: string): never {
  throw new SetupError(
    `${table}: incompatible ${detail}. No automatic upgrades; reconcile the schema explicitly.`,
  );
}

async function checkPostgres(db: PrismaClient, sql: string[]) {
  const base = await db.$queryRaw<{ present: boolean }[]>`
    SELECT to_regclass('projects') IS NOT NULL AS present`;
  if (!base[0]?.present)
    throw new SetupError(
      "Postgres projects table missing; apply baseline migrations first.",
    );
  const missing: string[] = [];
  for (const statement of sql) {
    const table = statement.match(/^CREATE TABLE IF NOT EXISTS "(\w+)"/);
    if (!table) continue;
    const name = table[1]!;
    const columns = await db.$queryRaw<
      {
        name: string;
        type: string;
        required: boolean;
        default: string | null;
      }[]
    >`
      SELECT a.attname AS name, format_type(a.atttypid, a.atttypmod) AS type,
        a.attnotnull AS required, pg_get_expr(d.adbin, d.adrelid) AS default
      FROM pg_attribute a
      LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
      WHERE a.attrelid = to_regclass(${name}) AND a.attnum > 0 AND NOT a.attisdropped
      ORDER BY a.attnum`;
    if (!columns.length) {
      missing.push(name);
      continue;
    }
    const expectedColumns = [
      ...statement.matchAll(/^\s+"(\w+)" ([^\n]+?)(?:,)?$/gm),
    ];
    if (columns.length !== expectedColumns.length)
      mismatch(name, "column count");
    for (const column of expectedColumns) {
      const actual = columns.find((item) => item.name === column[1]);
      const definition = column[2]!.replace(/,$/, "");
      const type = definition.split(/ NOT NULL| DEFAULT/)[0]!;
      const defaultValue = definition.split(" DEFAULT ")[1] ?? "";
      if (
        !actual ||
        normalizePostgres(actual.type) !== normalizePostgres(type) ||
        actual.required !== definition.includes("NOT NULL") ||
        normalizePostgres(actual.default ?? "") !==
          normalizePostgres(defaultValue)
      ) {
        mismatch(name, `column ${column[1]}`);
      }
    }
    const constraints = await db.$queryRaw<
      { name: string; definition: string; validated: boolean }[]
    >`
      SELECT conname AS name, pg_get_constraintdef(oid) AS definition, convalidated AS validated
      FROM pg_constraint WHERE conrelid = to_regclass(${name})`;
    const expectedConstraints = [
      ...statement.matchAll(/CONSTRAINT "(\w+)" ([^\n]+)/g),
    ];
    if (constraints.length !== expectedConstraints.length)
      mismatch(name, "constraints");
    for (const constraint of expectedConstraints) {
      const actual = constraints.find((item) => item.name === constraint[1]);
      if (
        !actual?.validated ||
        normalizePostgres(actual.definition) !==
          normalizePostgres(constraint[2]!.replace(/,$/, ""))
      ) {
        mismatch(name, `constraint ${constraint[1]}`);
      }
    }
    const indexes = await db.$queryRaw<
      { name: string; definition: string; valid: boolean }[]
    >`
      SELECT c.relname AS name, pg_get_indexdef(i.indexrelid) AS definition, i.indisvalid AS valid
      FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
      WHERE i.indrelid = to_regclass(${name})`;
    const [{ schema }] = await db.$queryRaw<
      { schema: string }[]
    >`SELECT current_schema() AS schema`;
    for (const index of sql.filter(
      (item) => item.startsWith("CREATE") && item.includes(` ON "${name}"`),
    )) {
      const indexName = index.match(/INDEX IF NOT EXISTS "(\w+)"/)![1];
      const actual = indexes.find((item) => item.name === indexName);
      if (
        !actual?.valid ||
        normalizePostgres(
          actual.definition
            .replace(`ON ${schema}.`, "ON ")
            .replace(`ON "${schema}".`, "ON "),
        ) !== normalizePostgres(index)
      ) {
        mismatch(name, `index ${indexName}`);
      }
    }
  }
  return missing;
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
        .replace(/ SETTINGS [\s\S]*$/, "");
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
      "env-file": { type: "string" },
      apply: { type: "boolean" },
      check: { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
    allowPositionals: true,
  });
  if (values.help) {
    console.log(`Usage: pnpm run topics:dev-tables [all|postgres|clickhouse] [--env-file /path/to/staging.env] [--apply|--check]
Defaults to a read-only preflight of both databases. --apply creates missing tables.
An explicit env file is the sole source of database configuration; otherwise root .env plus exported variables are used.
ClickHouse uses CLICKHOUSE_URL (HTTP/HTTPS), not CLICKHOUSE_MIGRATION_URL. Self-managed clustered ClickHouse is unsupported.`);
    return;
  }
  const target = positionals[0] ?? "all";
  if (
    positionals.length > 1 ||
    !["all", "postgres", "clickhouse"].includes(target) ||
    (values.apply && values.check)
  ) {
    throw new SetupError("Invalid arguments. Use --help.");
  }
  const envFile = values["env-file"];
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
  let postgres: PrismaClient | undefined;
  let clickhouse: ClickHouseClient | undefined;
  const postgresSql = statements("postgres.sql");
  const clickhouseSql = statements("clickhouse.sql");
  try {
    if (target !== "clickhouse") {
      const url = new URL(config.DIRECT_URL || required("DATABASE_URL"));
      if (!["postgres:", "postgresql:"].includes(url.protocol))
        throw new SetupError("Postgres requires a postgresql:// URL.");
      console.log(
        `Postgres: ${url.host}${url.pathname}, schema=${url.searchParams.get("schema") ?? "public"}`,
      );
      postgres = new PrismaClient({ datasources: { db: { url: url.href } } });
    }
    if (target !== "postgres") {
      if (![undefined, "false"].includes(config.CLICKHOUSE_CLUSTER_ENABLED)) {
        throw new SetupError(
          "This script supports single-node ClickHouse and ClickHouse Cloud (CLICKHOUSE_CLUSTER_ENABLED=false). Self-managed clusters require explicit replicated provisioning.",
        );
      }
      const url = new URL(required("CLICKHOUSE_URL"));
      if (!["http:", "https:"].includes(url.protocol))
        throw new SetupError("CLICKHOUSE_URL requires HTTP or HTTPS.");
      const database = envFile
        ? required("CLICKHOUSE_DB")
        : config.CLICKHOUSE_DB || "default";
      console.log(
        `ClickHouse: ${url.protocol}//${url.host}, database=${database}`,
      );
      clickhouse = createClient({
        url: url.href,
        username: required("CLICKHOUSE_USER"),
        password: required("CLICKHOUSE_PASSWORD", true),
        database,
        request_timeout: 30_000,
      });
    }
    // Complete both preflights before either database receives DDL.
    const missingPostgres = postgres
      ? await checkPostgres(postgres, postgresSql)
      : [];
    const missingClickhouse = clickhouse
      ? await checkClickhouse(clickhouse, clickhouseSql)
      : [];
    console.log(
      `Missing tables: Postgres [${missingPostgres.join(", ")}]; ClickHouse [${missingClickhouse.join(", ")}]`,
    );
    if (!values.apply) {
      console.log(
        "Preflight passed; no changes made. Use --apply to create missing tables.",
      );
      return;
    }
    if (postgres && missingPostgres.length) {
      await postgres.$transaction(
        async (tx) => {
          await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '10s'");
          for (const statement of postgresSql)
            await tx.$executeRawUnsafe(statement);
        },
        { timeout: 60_000 },
      );
    }
    if (clickhouse) {
      for (const statement of clickhouseSql) {
        if (
          missingClickhouse.includes(
            statement.match(/^CREATE TABLE IF NOT EXISTS (\w+)/)![1]!,
          )
        ) {
          await clickhouse.command({ query: statement });
        }
      }
    }
    const remainingPostgres = postgres
      ? await checkPostgres(postgres, postgresSql)
      : [];
    const remainingClickhouse = clickhouse
      ? await checkClickhouse(clickhouse, clickhouseSql)
      : [];
    if (remainingPostgres.length || remainingClickhouse.length)
      throw new SetupError("Tables still missing after provisioning.");
    console.log(
      "Topics tables ready; schemas verified. No data seeded or deleted.",
    );
  } finally {
    await Promise.all([postgres?.$disconnect(), clickhouse?.close()]);
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
