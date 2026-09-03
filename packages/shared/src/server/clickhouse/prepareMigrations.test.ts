import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const sharedDirectory = resolve(__dirname, "../../..");
const scriptsDirectory = join(sharedDirectory, "clickhouse/scripts");
const fakeMigratePath = join(__dirname, "fixtures/fake-migrate.sh");
const migrationSourceDirectory = join(
  sharedDirectory,
  "clickhouse/migrations/canonical",
);
const historicalMigrationCount = 94;
const historicalMigrationVersion = 47;
// Compatibility baselines for migrations 0001-0047 as shipped in each mode.
const historicalClusteredHash =
  "1f1cceaf0d89af2c78ec6f527dc9722900a572aa743f7650a83b277c7ae49fc2";
const historicalUnclusteredHash =
  "26de8baf42d0690445c9e8ec11951b1c85696b63d8bd47845c695803fced0aa3";
const temporaryDirectories: string[] = [];

type MigrationMode = "clustered" | "unclustered";
type MigrationScript = "up" | "down";
type MigrationLayout = "delivered" | "source";

type MigrationRun = {
  args: string[];
  capturedMigrationsDirectory: string;
  databaseUrl: string;
  renderedMigrationsDirectory: string;
  status: number | null;
  stdin: string;
};

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

function createTemporaryDirectory(prefix: string): string {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

function runMigrationScript({
  clusterName,
  migrationLayout = "source",
  migrateExitCode = 0,
  mode,
  script = "up",
  ssl = false,
}: {
  clusterName?: string;
  migrationLayout?: MigrationLayout;
  migrateExitCode?: number;
  mode: MigrationMode;
  script?: MigrationScript;
  ssl?: boolean;
}): MigrationRun {
  const root = createTemporaryDirectory("langfuse-clickhouse-migration-test-");
  const binaryDirectory = join(root, "bin");
  const workingDirectory = join(root, "shared");
  const temporaryDirectory = join(root, "tmp");
  const capturedMigrationsDirectory = join(root, "captured-migrations");
  const capturedArgsPath = join(root, "captured-args");
  const capturedSourcePath = join(root, "captured-source");
  const capturedStdinPath = join(root, "captured-stdin");

  mkdirSync(binaryDirectory);
  mkdirSync(workingDirectory);
  mkdirSync(temporaryDirectory);
  mkdirSync(capturedMigrationsDirectory);
  const clickhouseDirectory = join(workingDirectory, "clickhouse");
  if (migrationLayout === "source") {
    symlinkSync(join(sharedDirectory, "clickhouse"), clickhouseDirectory);
  } else {
    const migrationsDirectory = join(clickhouseDirectory, "migrations");
    mkdirSync(migrationsDirectory, { recursive: true });
    cpSync(scriptsDirectory, join(clickhouseDirectory, "scripts"), {
      recursive: true,
    });
    symlinkSync(
      migrationSourceDirectory,
      join(migrationsDirectory, "canonical"),
    );

    for (const deliveredMode of ["clustered", "unclustered"] as const) {
      const rendered = spawnSync(
        process.execPath,
        [
          join(scriptsDirectory, "prepare-migrations.mjs"),
          "render",
          migrationSourceDirectory,
          deliveredMode,
          "default",
        ],
        { encoding: "utf8" },
      );
      expect(rendered.status, rendered.stderr).toBe(0);
      const renderedDirectory = rendered.stdout.trim();
      temporaryDirectories.push(renderedDirectory);
      cpSync(renderedDirectory, join(migrationsDirectory, deliveredMode), {
        recursive: true,
      });
    }
  }

  symlinkSync(fakeMigratePath, join(binaryDirectory, "migrate"));

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    CAPTURED_ARGS_PATH: capturedArgsPath,
    CAPTURED_MIGRATIONS_DIRECTORY: capturedMigrationsDirectory,
    CAPTURED_SOURCE_PATH: capturedSourcePath,
    CAPTURED_STDIN_PATH: capturedStdinPath,
    CAPTURE_STDIN: script === "down" ? "true" : "false",
    CLICKHOUSE_CLUSTER_ENABLED: mode === "clustered" ? "true" : "false",
    CLICKHOUSE_DB: "default",
    CLICKHOUSE_MIGRATION_SSL: ssl ? "true" : "false",
    CLICKHOUSE_MIGRATION_URL: "clickhouse://localhost:9000",
    CLICKHOUSE_PASSWORD: "password",
    CLICKHOUSE_URL: "http://localhost:8123",
    CLICKHOUSE_USER: "user",
    MIGRATE_EXIT_CODE: String(migrateExitCode),
    PATH: [
      binaryDirectory,
      ...(migrationLayout === "source" ? [dirname(process.execPath)] : []),
      "/usr/bin",
      "/bin",
    ].join(":"),
    SKIP_CONFIRM: script === "down" ? "true" : "false",
    TMPDIR: temporaryDirectory,
  };
  if (clusterName === undefined) {
    delete env.CLICKHOUSE_CLUSTER_NAME;
  } else {
    env.CLICKHOUSE_CLUSTER_NAME = clusterName;
  }

  const migrationScriptPath =
    migrationLayout === "delivered"
      ? join(clickhouseDirectory, "scripts", `${script}.sh`)
      : join(scriptsDirectory, `${script}.sh`);
  const execution = spawnSync("sh", [migrationScriptPath], {
    cwd: workingDirectory,
    env,
    encoding: "utf8",
  });
  expect(execution.status, execution.stderr).toBe(migrateExitCode);

  const args = readFileSync(capturedArgsPath, "utf8").trimEnd().split("\n");
  const renderedMigrationsDirectory = readFileSync(capturedSourcePath, "utf8");
  const databaseArgumentIndex = args.indexOf("-database");

  return {
    args,
    capturedMigrationsDirectory,
    databaseUrl: args[databaseArgumentIndex + 1] ?? "",
    renderedMigrationsDirectory,
    status: execution.status,
    stdin: existsSync(capturedStdinPath)
      ? readFileSync(capturedStdinPath, "utf8")
      : "",
  };
}

function readMigration(run: MigrationRun, file: string): string {
  return readFileSync(join(run.capturedMigrationsDirectory, file), "utf8");
}

function readHistoricalSql(run: MigrationRun): string {
  return historicalMigrationFiles(run.capturedMigrationsDirectory)
    .map((file) => readMigration(run, file))
    .join("\n");
}

function countMatches(value: string, pattern: RegExp): number {
  return [...value.matchAll(pattern)].length;
}

function historicalMigrationFiles(directory: string): string[] {
  return readdirSync(directory)
    .filter(
      (file) =>
        file.endsWith(".sql") &&
        Number(file.slice(0, 4)) <= historicalMigrationVersion,
    )
    .sort();
}

function hashHistoricalMigrations(directory: string): string {
  const hash = createHash("sha256");
  const files = historicalMigrationFiles(directory);
  expect(files).toHaveLength(historicalMigrationCount);

  for (const file of files) {
    hash.update(file);
    hash.update("\0");
    hash.update(readFileSync(join(directory, file), "utf8"));
    hash.update("\0");
  }

  return hash.digest("hex");
}

describe("ClickHouse migration preparation", () => {
  it("renders and URL-encodes a custom cluster name through POSIX sh", () => {
    const clusterName = "eu-west' & blue";
    const run = runMigrationScript({ clusterName, mode: "clustered" });
    const sql = readMigration(run, "0001_traces.up.sql");
    const allSql = readHistoricalSql(run);

    expect(sql).toContain("ON CLUSTER 'eu-west\\' & blue'");
    expect(sql).toContain("ENGINE = ReplicatedReplacingMergeTree");
    expect(sql).not.toContain("ON CLUSTER default");
    expect(countMatches(allSql, /ON CLUSTER 'eu-west\\' & blue'/g)).toBe(204);
    expect(run.databaseUrl).toContain(
      `&x-cluster-name=${encodeURIComponent(`'eu-west\\' & blue'`).replaceAll("'", "%27")}`,
    );
    expect(run.databaseUrl).toContain(
      "&x-migrations-table-engine=ReplicatedMergeTree",
    );
    expect(run.args.at(-1)).toBe("up");
    expect(existsSync(run.renderedMigrationsDirectory)).toBe(false);
  });

  it("preserves the historical default-cluster migration bytes", () => {
    const run = runMigrationScript({ mode: "clustered", ssl: true });
    const allSql = readHistoricalSql(run);

    expect(hashHistoricalMigrations(run.capturedMigrationsDirectory)).toBe(
      historicalClusteredHash,
    );
    expect(countMatches(allSql, /\bON CLUSTER default\b/g)).toBe(204);
    expect(countMatches(allSql, /\balter_sync = 2\b/g)).toBe(85);
    expect(countMatches(allSql, /\bmutations_sync = 2\b/g)).toBe(19);
    expect(countMatches(allSql, /\bReplicated[A-Za-z]*MergeTree\b/g)).toBe(10);
    expect(run.databaseUrl).toContain("&x-cluster-name=default");
    expect(run.databaseUrl).toContain("&secure=true&skip_verify=true");
  });

  it("preserves the historical unclustered migration bytes", () => {
    const run = runMigrationScript({
      clusterName: "ignored-cluster",
      mode: "unclustered",
    });
    const allSql = readHistoricalSql(run);

    expect(hashHistoricalMigrations(run.capturedMigrationsDirectory)).toBe(
      historicalUnclusteredHash,
    );
    expect(allSql).not.toMatch(/\bON\s+CLUSTER\b/);
    expect(allSql).not.toMatch(/\bReplicated[A-Za-z]*MergeTree\b/);
    expect(countMatches(allSql, /\balter_sync = 2\b/g)).toBe(6);
    expect(countMatches(allSql, /\bmutations_sync = 2\b/g)).toBe(18);
    expect(readMigration(run, "0015_add_scores_trace_index.up.sql")).toContain(
      "SETTINGS mutations_sync = 2",
    );
    expect(readMigration(run, "0033_add_tool_call_columns.up.sql")).toContain(
      "SETTINGS alter_sync = 2",
    );
    expect(
      readMigration(run, "0047_add_eval_execution_columns.up.sql"),
    ).not.toMatch(/(?:alter|mutations)_sync/);
    expect(run.databaseUrl).not.toContain("x-cluster-name");
    expect(run.databaseUrl).toContain("&x-migrations-table-engine=MergeTree");
  });

  it.each(["clustered", "unclustered"] as const)(
    "uses the delivered %s migrations without runtime rendering",
    (mode) => {
      const run = runMigrationScript({ migrationLayout: "delivered", mode });

      expect(run.renderedMigrationsDirectory).toContain(`/migrations/${mode}`);
      expect(existsSync(run.renderedMigrationsDirectory)).toBe(true);
      expect(hashHistoricalMigrations(run.capturedMigrationsDirectory)).toBe(
        mode === "clustered"
          ? historicalClusteredHash
          : historicalUnclusteredHash,
      );
    },
  );

  it("renders down migrations, confirms non-interactively, and cleans up", () => {
    const run = runMigrationScript({ mode: "unclustered", script: "down" });

    expect(run.args.at(-1)).toBe("down");
    expect(run.stdin).toBe("y\n");
    expect(existsSync(run.renderedMigrationsDirectory)).toBe(false);
  });

  it("propagates migrate failures and still cleans up", () => {
    const run = runMigrationScript({
      migrateExitCode: 23,
      mode: "clustered",
    });

    expect(run.status).toBe(23);
    expect(existsSync(run.renderedMigrationsDirectory)).toBe(false);
  });

  it("rejects hardcoded cluster clauses in canonical migrations", () => {
    const sourceDirectory = createTemporaryDirectory(
      "langfuse-clickhouse-invalid-migrations-",
    );
    const invalidSql =
      "CREATE TABLE test {CLICKHOUSE_CLUSTER_CLAUSE} () ENGINE = {CLICKHOUSE_REPLICATION_PREFIX}MergeTree; ON CLUSTER default;";
    writeFileSync(join(sourceDirectory, "0001_test.up.sql"), invalidSql);
    writeFileSync(join(sourceDirectory, "0001_test.down.sql"), invalidSql);

    const result = spawnSync(
      "node",
      [
        join(scriptsDirectory, "prepare-migrations.mjs"),
        "render",
        sourceDirectory,
        "clustered",
        "default",
      ],
      { encoding: "utf8" },
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("hardcoded ON CLUSTER clause");
  });

  it("keeps every canonical migration renderable in both modes", () => {
    for (const mode of ["clustered", "unclustered"] as const) {
      const result = spawnSync(
        "node",
        [
          join(scriptsDirectory, "prepare-migrations.mjs"),
          "render",
          migrationSourceDirectory,
          mode,
          "default",
        ],
        { encoding: "utf8" },
      );

      expect(result.status, result.stderr).toBe(0);
      const renderedDirectory = result.stdout.trim();
      temporaryDirectories.push(renderedDirectory);
      const renderedSql = historicalMigrationFiles(renderedDirectory)
        .map((file) => readFileSync(join(renderedDirectory, file), "utf8"))
        .join("\n");
      expect(renderedSql).not.toMatch(/\{CLICKHOUSE_[A-Z_]+/);
    }
  });
});
