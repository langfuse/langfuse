import { prisma } from "../../src/db";
import { clickhouseClient, redis } from "../../src/server";
import { SeedError } from "./scenarios/types";

export type CheckStatus = "pass" | "warn" | "fail";

export type CheckResult = {
  name: string;
  status: CheckStatus;
  detail: string;
  fix?: string;
};

const FIX = {
  envFile: "cp .env.dev.example .env  (then review required values)",
  infraUp: "pnpm run infra:dev:up",
  chMigrate: "pnpm --filter=shared run ch:up",
  chDevTables: "pnpm --filter=shared run ch:dev-tables",
  dbMigrate: "pnpm --filter=shared run db:migrate",
  dbSeed:
    "pnpm --filter=shared run db:seed  (creates the default seed projects)",
  devWeb: "pnpm run dev:web",
};

const withTimeout = async <T>(promise: Promise<T>, ms: number): Promise<T> => {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`timed out after ${ms}ms`)),
          ms,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

const checkEnvFile = (): CheckResult => {
  // Keep in sync with REQUIRED_ENV_VARS in ../cli.ts (the bootstrap checks
  // them before importing src/server, whose env schema would otherwise throw).
  const missing = [
    "DATABASE_URL",
    "CLICKHOUSE_URL",
    "CLICKHOUSE_USER",
    "CLICKHOUSE_PASSWORD",
  ].filter((name) => !process.env[name]);
  return missing.length === 0
    ? { name: "env", status: "pass", detail: "required env vars present" }
    : {
        name: "env",
        status: "fail",
        detail: `missing env vars: ${missing.join(", ")} — is the repo-root .env present?`,
        fix: FIX.envFile,
      };
};

const checkPostgres = async (): Promise<CheckResult> => {
  try {
    await withTimeout(prisma.$queryRaw`SELECT 1`, 4000);
    return { name: "postgres", status: "pass", detail: "reachable" };
  } catch (error) {
    return {
      name: "postgres",
      status: "fail",
      detail: `cannot reach Postgres: ${(error as Error).message}`,
      fix: FIX.infraUp,
    };
  }
};

const checkMigrations = async (): Promise<CheckResult> => {
  try {
    const rows = await withTimeout(
      prisma.$queryRaw<
        { count: bigint }[]
      >`SELECT count(*)::bigint AS count FROM _prisma_migrations WHERE finished_at IS NOT NULL`,
      4000,
    );
    const applied = Number(rows[0]?.count ?? 0);
    return applied > 0
      ? {
          name: "postgres-migrations",
          status: "pass",
          detail: `${applied} migrations applied`,
        }
      : {
          name: "postgres-migrations",
          status: "fail",
          detail: "no applied migrations found",
          fix: FIX.dbMigrate,
        };
  } catch (error) {
    return {
      name: "postgres-migrations",
      status: "fail",
      detail: `cannot read _prisma_migrations: ${(error as Error).message}`,
      fix: FIX.dbMigrate,
    };
  }
};

const checkProject = async (projectId: string): Promise<CheckResult> => {
  try {
    const project = await withTimeout(
      prisma.project.findUnique({ where: { id: projectId } }),
      4000,
    );
    return project
      ? {
          name: "project",
          status: "pass",
          detail: `project ${projectId} exists`,
        }
      : {
          name: "project",
          status: "fail",
          detail: `project ${projectId} not found in Postgres`,
          fix: `${FIX.dbSeed} — or pass an existing project via --project <id>`,
        };
  } catch (error) {
    return {
      name: "project",
      status: "fail",
      detail: (error as Error).message,
      fix: FIX.infraUp,
    };
  }
};

const fetchClickhouseTables = async (): Promise<Set<string>> => {
  const result = await withTimeout(
    clickhouseClient().query({
      query: `SELECT name FROM system.tables WHERE database = currentDatabase() AND name IN ('traces', 'observations', 'scores', 'events_full', 'events_core')`,
      format: "JSONEachRow",
    }),
    4000,
  );
  const rows = await result.json<{ name: string }>();
  return new Set(rows.map((row) => row.name));
};

const checkClickhouse = async (): Promise<{
  connectivity: CheckResult;
  legacyTables: CheckResult;
  v4Tables: CheckResult;
}> => {
  let tables: Set<string>;
  try {
    tables = await fetchClickhouseTables();
  } catch (error) {
    const fail: CheckResult = {
      name: "clickhouse",
      status: "fail",
      detail: `cannot reach ClickHouse: ${(error as Error).message}`,
      fix: FIX.infraUp,
    };
    return {
      connectivity: fail,
      legacyTables: {
        name: "clickhouse-tables",
        status: "fail",
        detail: "skipped (no connection)",
        fix: FIX.chMigrate,
      },
      v4Tables: {
        name: "clickhouse-v4-tables",
        status: "warn",
        detail: "skipped (no connection)",
        fix: FIX.chDevTables,
      },
    };
  }

  const legacyMissing = ["traces", "observations", "scores"].filter(
    (table) => !tables.has(table),
  );
  const v4Missing = ["events_full", "events_core"].filter(
    (table) => !tables.has(table),
  );

  return {
    connectivity: { name: "clickhouse", status: "pass", detail: "reachable" },
    legacyTables:
      legacyMissing.length === 0
        ? {
            name: "clickhouse-tables",
            status: "pass",
            detail: "traces/observations/scores present",
          }
        : {
            name: "clickhouse-tables",
            status: "fail",
            detail: `missing tables: ${legacyMissing.join(", ")} — migrations not applied`,
            fix: FIX.chMigrate,
          },
    v4Tables:
      v4Missing.length === 0
        ? {
            name: "clickhouse-v4-tables",
            status: "pass",
            detail: "events_full/events_core present",
          }
        : {
            name: "clickhouse-v4-tables",
            status: "warn",
            detail: `missing v4 dev tables: ${v4Missing.join(", ")} — --v4 scenarios unavailable`,
            fix: FIX.chDevTables,
          },
  };
};

const checkRedis = async (): Promise<CheckResult> => {
  if (!redis) {
    return {
      name: "redis",
      status: "warn",
      detail:
        "redis client not configured (only needed for ingestion/worker paths)",
      fix: FIX.infraUp,
    };
  }
  try {
    await withTimeout(redis.ping(), 2500);
    return { name: "redis", status: "pass", detail: "reachable" };
  } catch (error) {
    return {
      name: "redis",
      status: "warn",
      detail: `cannot reach Redis: ${(error as Error).message}`,
      fix: FIX.infraUp,
    };
  }
};

const checkHttp = async (
  name: string,
  url: string,
  fix: string,
  detailOnPass: string,
): Promise<CheckResult> => {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (!response.ok) {
      return {
        name,
        status: "warn",
        detail: `${url} returned HTTP ${response.status}`,
        fix,
      };
    }
    return { name, status: "pass", detail: detailOnPass };
  } catch {
    return { name, status: "warn", detail: `no response from ${url}`, fix };
  }
};

const checkMinio = async (): Promise<CheckResult> => {
  // CLI script, not a turbo task — probes the dev env directly.
  // eslint-disable-next-line turbo/no-undeclared-env-vars
  const endpoint = process.env.LANGFUSE_S3_EVENT_UPLOAD_ENDPOINT;
  if (!endpoint) {
    return {
      name: "blob-storage",
      status: "warn",
      detail:
        "LANGFUSE_S3_EVENT_UPLOAD_ENDPOINT not set (only needed for media/event uploads)",
      fix: "set LANGFUSE_S3_EVENT_UPLOAD_ENDPOINT in .env (e.g. http://localhost:9090) if media/event upload tests are needed",
    };
  }
  return checkHttp(
    "blob-storage",
    `${endpoint.replace(/\/$/, "")}/minio/health/live`,
    FIX.infraUp,
    `reachable at ${endpoint}`,
  );
};

export const runDoctor = async (
  baseUrl: string,
  projectId: string,
): Promise<{ ok: boolean; checks: CheckResult[] }> => {
  const env = checkEnvFile();
  if (env.status === "fail") {
    return { ok: false, checks: [env] };
  }

  const [postgres, migrations, project, clickhouse, redisCheck, minio, web] =
    await Promise.all([
      checkPostgres(),
      checkMigrations(),
      checkProject(projectId),
      checkClickhouse(),
      checkRedis(),
      checkMinio(),
      checkHttp(
        "web-app",
        `${baseUrl}/api/public/health`,
        FIX.devWeb,
        `responding at ${baseUrl} (deep links will work)`,
      ),
    ]);

  const checks = [
    env,
    postgres,
    migrations,
    project,
    clickhouse.connectivity,
    clickhouse.legacyTables,
    clickhouse.v4Tables,
    redisCheck,
    minio,
    web,
  ];
  return { ok: checks.every((check) => check.status !== "fail"), checks };
};

/**
 * Fast subset of doctor that scenario runs execute first, so a broken stack
 * fails in seconds with the exact fix instead of a stack trace mid-insert.
 */
export const preflight = async (opts: {
  projectId: string;
  needV4: boolean;
  log: (message: string) => void;
}): Promise<void> => {
  const env = checkEnvFile();
  if (env.status === "fail") {
    throw new SeedError(env.detail, env.fix);
  }

  const [postgres, project, clickhouse] = await Promise.all([
    checkPostgres(),
    checkProject(opts.projectId),
    checkClickhouse(),
  ]);

  const required: CheckResult[] = [
    postgres,
    project,
    clickhouse.connectivity,
    clickhouse.legacyTables,
  ];
  if (opts.needV4) {
    required.push({
      ...clickhouse.v4Tables,
      status:
        clickhouse.v4Tables.status === "warn"
          ? "fail"
          : clickhouse.v4Tables.status,
    });
  }

  const failed = required.find((check) => check.status === "fail");
  if (failed) {
    throw new SeedError(
      `preflight failed [${failed.name}]: ${failed.detail}`,
      failed.fix,
    );
  }
  opts.log("preflight ok (postgres, project, clickhouse)");
};
