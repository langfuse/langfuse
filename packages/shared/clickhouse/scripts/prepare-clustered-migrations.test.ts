import { execFileSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const clusteredMigrationsDir = join(scriptDir, "../migrations/clustered");
const helperPath = join(scriptDir, "prepare-clustered-migrations.sh");
const upScriptPath = join(scriptDir, "up.sh");
const downScriptPath = join(scriptDir, "down.sh");
const clusterNamePlaceholder = "{CLICKHOUSE_CLUSTER_NAME}";
const temporaryDirectories: string[] = [];

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

function createMigrationFixture(sql?: string): string {
  const root = createTemporaryDirectory("langfuse-clickhouse-migrations-");
  const migrations = join(root, "migrations");
  mkdirSync(migrations);

  writeFileSync(
    join(migrations, "0001_example.up.sql"),
    sql ??
      `CREATE TABLE traces ON CLUSTER ${clusterNamePlaceholder} (id String DEFAULT 'default');\n`,
  );
  writeFileSync(
    join(migrations, "0001_example.down.sql"),
    `DROP TABLE traces ON CLUSTER ${clusterNamePlaceholder};\n`,
  );

  return migrations;
}

function prepareMigrations(sourceDirectory: string, clusterName: string): string {
  const output = execFileSync(
    "bash",
    [
      "-c",
      'source "$HELPER_PATH"; prepare_clustered_migrations "$SOURCE_DIRECTORY" "$CLUSTER_NAME"',
    ],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        CLUSTER_NAME: clusterName,
        HELPER_PATH: helperPath,
        SOURCE_DIRECTORY: sourceDirectory,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  ).trim();

  temporaryDirectories.push(output);
  return output;
}

interface FakeMigrate {
  argsPath: string;
  binDirectory: string;
  capturePath: string;
  renderedSqlPath: string;
}

function createFakeMigrate(): FakeMigrate {
  const root = createTemporaryDirectory("langfuse-fake-migrate-");
  const binDirectory = join(root, "bin");
  const argsPath = join(root, "args.txt");
  const capturePath = join(root, "source.txt");
  const renderedSqlPath = join(root, "rendered.sql");
  mkdirSync(binDirectory);

  const executable = join(binDirectory, "migrate");
  writeFileSync(
    executable,
    [
      "#!/bin/bash",
      "set -eu",
      'printf \'%s\\n\' "$@" > "$MIGRATE_ARGS_PATH"',
      'source_uri=""',
      'while [ "$#" -gt 0 ]; do',
      '  case "$1" in',
      "    -source)",
      '      source_uri="$2"',
      "      shift 2",
      "      ;;",
      "    *)",
      "      shift",
      "      ;;",
      "  esac",
      "done",
      'case "$source_uri" in',
      '  file://*) source_dir="${source_uri#file://}" ;;',
      '  *) echo "missing file:// migration source" >&2; exit 1 ;;',
      "esac",
      '[ -d "$source_dir" ]',
      "grep -R -F \"ON CLUSTER '$EXPECTED_CLUSTER_NAME'\" \"$source_dir\" >/dev/null",
      'if grep -R -F "$CLUSTER_NAME_PLACEHOLDER" "$source_dir" >/dev/null; then',
      '  echo "unrendered cluster placeholder" >&2',
      "  exit 1",
      "fi",
      'printf \'%s\\n\' "$source_uri" > "$MIGRATE_CAPTURE_PATH"',
      'cp "$source_dir/0001_traces.up.sql" "$MIGRATE_RENDERED_SQL_PATH"',
      "",
    ].join("\n"),
  );
  chmodSync(executable, 0o755);

  return { argsPath, binDirectory, capturePath, renderedSqlPath };
}

function runMigrationScript(
  scriptPath: string,
  expectedClusterName: string,
  configuredClusterName?: string,
): {
  args: string;
  renderedSql: string;
  sourceDirectory: string;
} {
  const fakeMigrate = createFakeMigrate();
  const workingDirectory = createTemporaryDirectory("langfuse-migration-cwd-");
  const environment: NodeJS.ProcessEnv = {
    ...process.env,
    CLICKHOUSE_CLUSTER_ENABLED: "true",
    CLICKHOUSE_DB: "default",
    CLICKHOUSE_MIGRATION_SSL: "false",
    CLICKHOUSE_MIGRATION_URL: "clickhouse://localhost:9000",
    CLICKHOUSE_PASSWORD: "password",
    CLICKHOUSE_URL: "http://localhost:8123",
    CLICKHOUSE_USER: "user",
    CLUSTER_NAME_PLACEHOLDER: clusterNamePlaceholder,
    EXPECTED_CLUSTER_NAME: expectedClusterName,
    MIGRATE_ARGS_PATH: fakeMigrate.argsPath,
    MIGRATE_CAPTURE_PATH: fakeMigrate.capturePath,
    MIGRATE_RENDERED_SQL_PATH: fakeMigrate.renderedSqlPath,
    PATH: `${fakeMigrate.binDirectory}:${process.env.PATH ?? ""}`,
    SKIP_CONFIRM: "true",
  };

  if (configuredClusterName === undefined) {
    delete environment.CLICKHOUSE_CLUSTER_NAME;
  } else {
    environment.CLICKHOUSE_CLUSTER_NAME = configuredClusterName;
  }

  execFileSync("bash", [scriptPath], {
    cwd: workingDirectory,
    env: environment,
    stdio: ["ignore", "pipe", "pipe"],
  });

  const sourceUri = readFileSync(fakeMigrate.capturePath, "utf8").trim();
  expect(sourceUri.startsWith("file://")).toBe(true);

  return {
    args: readFileSync(fakeMigrate.argsPath, "utf8"),
    renderedSql: readFileSync(fakeMigrate.renderedSqlPath, "utf8"),
    sourceDirectory: sourceUri.slice("file://".length),
  };
}

describe("prepare_clustered_migrations", () => {
  it("keeps every clustered migration on the explicit placeholder contract", () => {
    const migrationFiles = readdirSync(clusteredMigrationsDir).filter((file) =>
      file.endsWith(".sql"),
    );

    expect(migrationFiles.length).toBeGreaterThan(0);
    for (const migrationFile of migrationFiles) {
      const sql = readFileSync(join(clusteredMigrationsDir, migrationFile), "utf8");
      const clusterClauses = sql.match(/ON CLUSTER/g) ?? [];
      const parameterizedClauses =
        sql.match(/ON CLUSTER \{CLICKHOUSE_CLUSTER_NAME\}/g) ?? [];

      expect(clusterClauses.length).toBeGreaterThan(0);
      expect(parameterizedClauses).toHaveLength(clusterClauses.length);
      expect(sql).not.toContain("ON CLUSTER default");
    }
  });

  it("renders a custom cluster name without modifying source migrations", () => {
    const sourceDirectory = createMigrationFixture();
    const preparedDirectory = prepareMigrations(
      sourceDirectory,
      "virtual-cluster",
    );

    expect(
      readFileSync(join(preparedDirectory, "0001_example.up.sql"), "utf8"),
    ).toContain("ON CLUSTER 'virtual-cluster'");
    expect(
      readFileSync(join(preparedDirectory, "0001_example.down.sql"), "utf8"),
    ).toContain("ON CLUSTER 'virtual-cluster'");
    expect(
      readFileSync(join(sourceDirectory, "0001_example.up.sql"), "utf8"),
    ).toContain(`ON CLUSTER ${clusterNamePlaceholder}`);
    expect(
      readFileSync(join(preparedDirectory, "0001_example.up.sql"), "utf8"),
    ).toContain("DEFAULT 'default'");
  });

  it("renders the default cluster through the same template path", () => {
    const sourceDirectory = createMigrationFixture();
    const preparedDirectory = prepareMigrations(sourceDirectory, "default");

    expect(
      readFileSync(join(preparedDirectory, "0001_example.up.sql"), "utf8"),
    ).toContain("ON CLUSTER 'default'");
  });

  it("rejects cluster names unsafe in SQL or the migration URL", () => {
    const sourceDirectory = createMigrationFixture();

    for (const unsafeName of [
      "cluster name",
      "cluster&admin=true",
      "cluster'; DROP TABLE traces; --",
    ]) {
      expect(() => prepareMigrations(sourceDirectory, unsafeName)).toThrow();
    }
  });

  it("fails closed when a migration contains a hardcoded cluster", () => {
    const sourceDirectory = createMigrationFixture(
      "CREATE TABLE traces ON CLUSTER default (id String);\n",
    );

    expect(() => prepareMigrations(sourceDirectory, "virtual-cluster")).toThrow();
  });

  it("fails closed when a migration omits the placeholder", () => {
    const sourceDirectory = createMigrationFixture("SELECT 1;\n");

    expect(() => prepareMigrations(sourceDirectory, "virtual-cluster")).toThrow();
  });

  it("fails closed when any ON CLUSTER clause bypasses the placeholder", () => {
    const sourceDirectory = createMigrationFixture(
      `CREATE TABLE traces ON CLUSTER ${clusterNamePlaceholder} (id String);\n` +
        "DROP TABLE traces_backup ON CLUSTER other-cluster;\n",
    );

    expect(() => prepareMigrations(sourceDirectory, "virtual-cluster")).toThrow();
  });

  it("passes a rendered temporary source to migrate for a custom cluster", () => {
    const result = runMigrationScript(
      upScriptPath,
      "virtual-cluster",
      "virtual-cluster",
    );

    expect(result.renderedSql).toContain("ON CLUSTER 'virtual-cluster'");
    expect(result.renderedSql).not.toContain(clusterNamePlaceholder);
    expect(result.args).toContain("x-cluster-name=virtual-cluster");
    expect(existsSync(result.sourceDirectory)).toBe(false);
  });

  it("defaults CLICKHOUSE_CLUSTER_NAME to default for down migrations", () => {
    const result = runMigrationScript(downScriptPath, "default");

    expect(result.renderedSql).toContain("ON CLUSTER 'default'");
    expect(result.args).toContain("x-cluster-name=default");
    expect(existsSync(result.sourceDirectory)).toBe(false);
  });

  it("keeps the migration shell scripts syntactically valid", () => {
    for (const scriptPath of [helperPath, upScriptPath, downScriptPath]) {
      expect(() => execFileSync("bash", ["-n", scriptPath])).not.toThrow();
    }
  });
});
