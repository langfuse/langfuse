#!/usr/bin/env node

import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const clusterClausePlaceholder = "{CLICKHOUSE_CLUSTER_CLAUSE}";
const replicationPrefixPlaceholder = "{CLICKHOUSE_REPLICATION_PREFIX}";
const historicalFinalNewlinesPattern =
  /\{CLICKHOUSE_HISTORICAL_FINAL_NEWLINES:(0|2|clustered)\}\n$/;
const anyHistoricalFinalNewlinesPattern =
  /\{CLICKHOUSE_HISTORICAL_FINAL_NEWLINES:[^{}]*\}/;
const clusteredOnlyPattern = /\{CLICKHOUSE_CLUSTERED_ONLY:([^{}]*)\}/g;
const unclusteredOnlyPattern = /\{CLICKHOUSE_UNCLUSTERED_ONLY:([^{}]*)\}/g;
const anyPlaceholderPattern = /\{CLICKHOUSE_[A-Z_]+(?::[^{}]*)?\}/;
const historicalByteCompatibilityVersion = 47;

function countOccurrences(value, search) {
  return value.split(search).length - 1;
}

function quoteClickHouseString(value) {
  if (value.includes("\0")) {
    throw new Error("ClickHouse cluster names must not contain NUL bytes");
  }

  return `'${value
    .replaceAll("\\", "\\\\")
    .replaceAll("'", "\\'")
    .replaceAll("\n", "\\n")
    .replaceAll("\r", "\\r")
    .replaceAll("\t", "\\t")}'`;
}

function renderMigration(
  source,
  mode,
  clusterName,
  preserveHistoricalUnclusteredWhitespace,
) {
  const placeholderCount = countOccurrences(source, clusterClausePlaceholder);
  const historicalFinalNewlines = source.match(historicalFinalNewlinesPattern);

  if (placeholderCount === 0) {
    throw new Error(`migration does not contain ${clusterClausePlaceholder}`);
  }

  if (/\bON\s+CLUSTER\b/i.test(source)) {
    throw new Error(
      `migration contains a hardcoded ON CLUSTER clause instead of ${clusterClausePlaceholder}`,
    );
  }

  if (/\bReplicated[A-Za-z]*MergeTree\b/.test(source)) {
    throw new Error(
      `migration contains a hardcoded replicated engine instead of ${replicationPrefixPlaceholder}`,
    );
  }

  if (
    countOccurrences(source, ` ${clusterClausePlaceholder}`) !==
    placeholderCount
  ) {
    throw new Error(
      `${clusterClausePlaceholder} must include its preceding space`,
    );
  }

  if (
    anyHistoricalFinalNewlinesPattern.test(source) &&
    !historicalFinalNewlines
  ) {
    throw new Error(
      "CLICKHOUSE_HISTORICAL_FINAL_NEWLINES must appear once at the end of a migration and use 0, 2, or clustered",
    );
  }

  const clusterClause =
    mode === "clustered"
      ? clusterName === "default"
        ? "ON CLUSTER default"
        : `ON CLUSTER ${quoteClickHouseString(clusterName)}`
      : "";

  const replicationPrefix = mode === "clustered" ? "Replicated" : "";
  let rendered = source
    .replaceAll(
      ` ${clusterClausePlaceholder}`,
      mode === "clustered" ? ` ${clusterClause}` : "",
    )
    .replaceAll(replicationPrefixPlaceholder, replicationPrefix)
    .replace(clusteredOnlyPattern, mode === "clustered" ? "$1" : "");

  if (mode === "unclustered" && preserveHistoricalUnclusteredWhitespace) {
    rendered = rendered.replace(/[ \t]+\n/g, "\n").replace(/\n[ \t]*;/g, ";");
  }

  rendered = rendered
    .replace(unclusteredOnlyPattern, mode === "unclustered" ? "$1" : "")
    .replace(historicalFinalNewlinesPattern, (_, finalNewlines) => {
      if (finalNewlines === "2") return "\n\n";
      if (finalNewlines === "clustered" && mode === "clustered") return "\n";
      return "";
    });

  if (anyPlaceholderPattern.test(rendered)) {
    throw new Error("migration contains an unrendered ClickHouse placeholder");
  }

  const renderedClusterClauseCount = countOccurrences(rendered, "ON CLUSTER");
  if (mode === "clustered" && renderedClusterClauseCount !== placeholderCount) {
    throw new Error("not every cluster clause placeholder was rendered");
  }

  if (mode === "unclustered") {
    if (renderedClusterClauseCount > 0) {
      throw new Error("unclustered migration contains an ON CLUSTER clause");
    }
    if (/\bReplicated[A-Za-z]*MergeTree\b/.test(rendered)) {
      throw new Error(
        "unclustered migration contains a replicated table engine",
      );
    }
  }

  return rendered;
}

function validateMigrationFileSet(files) {
  if (files.length === 0) {
    throw new Error("no ClickHouse migration SQL files found");
  }

  const fileSet = new Set(files);
  const filesByVersion = new Map();

  for (const file of files) {
    const match = /^(\d{4})_.+\.(up|down)\.sql$/.exec(file);
    if (!match) {
      throw new Error(`invalid ClickHouse migration filename: ${file}`);
    }

    const version = Number(match[1]);
    if (version < 1) {
      throw new Error(`invalid ClickHouse migration version in ${file}`);
    }
    filesByVersion.set(version, (filesByVersion.get(version) ?? 0) + 1);
    const counterpart =
      match[2] === "up"
        ? file.replace(/\.up\.sql$/, ".down.sql")
        : file.replace(/\.down\.sql$/, ".up.sql");
    if (!fileSet.has(counterpart)) {
      throw new Error(`missing migration counterpart for ${file}`);
    }
  }

  const highestVersion = Math.max(...filesByVersion.keys());
  for (let version = 1; version <= highestVersion; version += 1) {
    const fileCount = filesByVersion.get(version);
    if (!fileCount) {
      throw new Error(`missing ClickHouse migration version ${version}`);
    }
    if (fileCount !== 2) {
      throw new Error(
        `ClickHouse migration version ${version} must have one up and one down file`,
      );
    }
  }
}

export function encodeClusterName(clusterName) {
  const clusterExpression =
    clusterName === "default"
      ? clusterName
      : quoteClickHouseString(clusterName);

  return encodeURIComponent(clusterExpression).replaceAll("'", "%27");
}

export function prepareMigrations(sourceDirectory, mode, clusterName) {
  if (mode !== "clustered" && mode !== "unclustered") {
    throw new Error(`unsupported ClickHouse migration mode: ${mode}`);
  }
  if (mode === "clustered" && clusterName.length === 0) {
    throw new Error("ClickHouse cluster name must not be empty");
  }

  const sourcePath = resolve(sourceDirectory);
  if (!statSync(sourcePath).isDirectory()) {
    throw new Error(
      `ClickHouse migration source is not a directory: ${sourcePath}`,
    );
  }

  const migrationFiles = readdirSync(sourcePath, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name)
    .sort();
  validateMigrationFileSet(migrationFiles);

  const targetDirectory = mkdtempSync(
    join(tmpdir(), `langfuse-clickhouse-${mode}-migrations-`),
  );

  try {
    for (const migrationFile of migrationFiles) {
      const source = readFileSync(join(sourcePath, migrationFile), "utf8");
      const migrationVersion = Number(migrationFile.slice(0, 4));
      const rendered = renderMigration(
        source,
        mode,
        clusterName,
        migrationVersion <= historicalByteCompatibilityVersion,
      );
      writeFileSync(join(targetDirectory, basename(migrationFile)), rendered);
    }
  } catch (error) {
    rmSync(targetDirectory, { force: true, recursive: true });
    throw error;
  }

  return targetDirectory;
}

function printUsage() {
  console.error(
    "Usage: prepare-migrations.mjs render <source-directory> <clustered|unclustered> <cluster-name> | encode-cluster-name <cluster-name>",
  );
}

function main() {
  const [command, ...args] = process.argv.slice(2);

  if (command === "render" && args.length === 3) {
    const [sourceDirectory, mode, clusterName] = args;
    process.stdout.write(
      `${prepareMigrations(sourceDirectory, mode, clusterName)}\n`,
    );
    return;
  }

  if (command === "encode-cluster-name" && args.length === 1) {
    process.stdout.write(`${encodeClusterName(args[0])}\n`);
    return;
  }

  printUsage();
  process.exitCode = 1;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    main();
  } catch (error) {
    console.error(
      `Error: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  }
}
