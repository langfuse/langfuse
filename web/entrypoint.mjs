// Shell-less port of entrypoint.sh plus packages/shared/clickhouse/scripts/up.sh
// for the hardened enterprise image, whose runtime has no /bin/sh. Keep the
// behavior in sync with those scripts.
import { spawn, spawnSync } from "node:child_process";
import os from "node:os";

// The prisma bin launcher relies on a shebang, so invoke the CLI entry module
// directly with node instead.
const PRISMA_CLI = "/usr/local/lib/node_modules/prisma/build/index.js";
const MIGRATE_BIN = "/bin/migrate";

const env = process.env;

// Strip valid percent-encoded sequences before checking so partially-encoded
// values like p%40ss@word are still caught.
const stripPercentEncoded = (value) => value.replace(/%[0-9A-Fa-f]{2}/g, "");

// Check whether a database URL's credentials contain characters that typically
// need percent-encoding for Prisma (@ : / % # ?). Best-effort heuristic —
// strips the scheme, extracts the authority (user:pass@host) before the first
// slash, and checks for common offenders.
function checkUnencodedCredentials(url) {
  const schemeIndex = url.indexOf("://");
  const noScheme = schemeIndex === -1 ? url : url.slice(schemeIndex + 3);
  const authority = noScheme.split("/")[0];
  const at = authority.lastIndexOf("@");
  if (at === -1) return;
  const creds = authority.slice(0, at);
  const colon = creds.indexOf(":");
  const user = colon === -1 ? creds : creds.slice(0, colon);
  const pass = colon === -1 ? creds : creds.slice(colon + 1);
  const offenders = /[@:/%#?]/;
  if (
    offenders.test(stripPercentEncoded(user)) ||
    offenders.test(stripPercentEncoded(pass))
  ) {
    console.log(
      "HINT: Your DATABASE_URL / DIRECT_URL credentials appear to contain special characters (@, :, /, %, #, ?) that are not URL-encoded.",
    );
    console.log(
      "  Prisma requires these to be percent-encoded, otherwise you will see P1013 errors.",
    );
    console.log("  Example: p@ssword → p%40ssword");
    console.log(
      "  Reference: https://www.prisma.io/docs/orm/reference/connection-urls#special-characters",
    );
  }
}

// Check whether CLICKHOUSE_PASSWORD contains characters that would break the
// query-string interpolation used for the migration URL (& = # ? % + @ space).
function checkClickhousePassword(pass) {
  if (!pass) return;
  if (/[&=#?%+@ ]/.test(stripPercentEncoded(pass))) {
    console.log(
      "HINT: Your CLICKHOUSE_PASSWORD contains special characters (&, =, #, ?, %, +, @, space) that may break the migration URL.",
    );
    console.log(
      "  These characters need to be percent-encoded when passed as query parameters.",
    );
    console.log("  Example: p@ss&word → p%40ss%26word");
  }
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: "inherit", ...options });
  if (result.error) console.error(result.error.message);
  return result.status ?? 1;
}

if (!env.DATABASE_URL) {
  if (
    env.DATABASE_HOST &&
    env.DATABASE_USERNAME &&
    env.DATABASE_PASSWORD &&
    env.DATABASE_NAME
  ) {
    // Construct DATABASE_URL from the provided variables
    env.DATABASE_URL = `postgresql://${env.DATABASE_USERNAME}:${env.DATABASE_PASSWORD}@${env.DATABASE_HOST}/${env.DATABASE_NAME}`;
  } else {
    console.error(
      "Error: Required database environment variables are not set. Provide a postgres url for DATABASE_URL.",
    );
    process.exit(1);
  }
  if (env.DATABASE_ARGS) {
    env.DATABASE_URL = `${env.DATABASE_URL}?${env.DATABASE_ARGS}`;
  }
}

if (!env.CLICKHOUSE_URL) {
  console.error(
    "Error: CLICKHOUSE_URL is not configured. Migrating from V2? Check out migration guide: https://langfuse.com/self-hosting/upgrade-guides/upgrade-v2-to-v3",
  );
  process.exit(1);
}

// Set DIRECT_URL to the value of DATABASE_URL if it is not set, required for migrations
if (!env.DIRECT_URL) {
  env.DIRECT_URL = env.DATABASE_URL;
}

// Always execute the postgres migration, except when disabled.
if (env.LANGFUSE_AUTO_POSTGRES_MIGRATION_DISABLED !== "true") {
  // Like entrypoint.sh, only `prisma migrate deploy` gates startup; the
  // cleanup script's exit status is not checked.
  run(process.execPath, [
    PRISMA_CLI,
    "db",
    "execute",
    "--url",
    env.DIRECT_URL,
    "--file",
    "./packages/shared/scripts/cleanup.sql",
  ]);
  const status = run(process.execPath, [
    PRISMA_CLI,
    "migrate",
    "deploy",
    "--schema=./packages/shared/prisma/schema.prisma",
  ]);
  if (status !== 0) {
    console.log("Applying database migrations failed. Common causes:");
    console.log("  1. The database is unavailable or unreachable.");
    console.log(
      "  2. DATABASE_URL / DIRECT_URL credentials contain special characters that are not URL-encoded.",
    );
    checkUnencodedCredentials(env.DIRECT_URL);
    console.log("Exiting...");
    process.exit(status);
  }
}

// Execute the Clickhouse migration, except when disabled.
if (env.LANGFUSE_AUTO_CLICKHOUSE_MIGRATION_DISABLED !== "true") {
  for (const name of [
    "CLICKHOUSE_MIGRATION_URL",
    "CLICKHOUSE_USER",
    "CLICKHOUSE_PASSWORD",
  ]) {
    if (!env[name]) {
      console.error(`Error: ${name} is not set.`);
      console.error(`Please set ${name} in your environment variables.`);
      process.exit(1);
    }
  }
  const database = env.CLICKHOUSE_DB || "default";
  const clusterName = env.CLICKHOUSE_CLUSTER_NAME || "default";
  const ssl =
    env.CLICKHOUSE_MIGRATION_SSL === "true"
      ? "&secure=true&skip_verify=true"
      : "";
  const unclustered = env.CLICKHOUSE_CLUSTER_ENABLED === "false";
  const engine = unclustered
    ? "&x-migrations-table-engine=MergeTree"
    : `&x-cluster-name=${clusterName}&x-migrations-table-engine=ReplicatedMergeTree`;
  const databaseUrl = `${env.CLICKHOUSE_MIGRATION_URL}?username=${env.CLICKHOUSE_USER}&password=${env.CLICKHOUSE_PASSWORD}&database=${database}&x-multi-statement=true${ssl}${engine}`;
  const source = `file://clickhouse/migrations/${unclustered ? "unclustered" : "clustered"}`;
  const status = run(MIGRATE_BIN, ["-source", source, "-database", databaseUrl, "up"], {
    cwd: "./packages/shared",
  });
  if (status !== 0) {
    console.log("Applying clickhouse migrations failed. Common causes:");
    console.log("  1. The database is unavailable or unreachable.");
    console.log(
      "  2. CLICKHOUSE_PASSWORD contains special characters that are not URL-encoded.",
    );
    checkClickhousePassword(env.CLICKHOUSE_PASSWORD);
    console.log("Exiting...");
    process.exit(status);
  }
}

// Run the command passed to the docker image on start
const argv = process.argv.slice(2);
if (argv.length === 0) process.exit(0);
const [command, ...args] = argv;
// Mirror the standard image's CMD conditional: load dd-trace only when
// NEXT_PUBLIC_LANGFUSE_CLOUD_REGION is configured.
if (command === "node" && env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION) {
  args.unshift("--import", "dd-trace/initialize.mjs");
}
const child = spawn(command === "node" ? process.execPath : command, args, {
  stdio: "inherit",
});
child.on("error", (error) => {
  console.error(error.message);
  process.exit(127);
});
for (const signal of ["SIGTERM", "SIGINT", "SIGQUIT", "SIGHUP"]) {
  process.on(signal, () => child.kill(signal));
}
child.on("exit", (code, signal) => {
  process.exit(code ?? 128 + (os.constants.signals[signal] ?? 0));
});
