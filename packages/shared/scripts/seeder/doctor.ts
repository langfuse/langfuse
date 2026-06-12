import { prisma } from "../../src/db";
import { greptimeQuery, redis } from "../../src/server";
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
  greptimeMigrate:
    "apply packages/shared/greptime/migrations/*.sql to the GREPTIME_DB database",
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
  // === undefined, not falsy — empty strings are valid for some of these
  // (matches the bootstrap precheck in ../cli.ts)
  const missing = [
    "DATABASE_URL",
    "CLICKHOUSE_URL",
    "CLICKHOUSE_USER",
    "CLICKHOUSE_PASSWORD",
  ].filter((name) => process.env[name] === undefined);
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
    // checkPostgres already proves connectivity, so a failure here is most
    // likely a missing table (Prisma P2021 — migrations not applied); only
    // P1xxx codes indicate connection-level problems.
    const prismaCode = (error as { code?: string }).code ?? "";
    return {
      name: "project",
      status: "fail",
      detail: (error as Error).message,
      fix: prismaCode.startsWith("P1") ? FIX.infraUp : FIX.dbMigrate,
    };
  }
};

const REQUIRED_GREPTIME_TABLES = ["traces", "observations", "scores"];

const checkGreptime = async (): Promise<{
  connectivity: CheckResult;
  tables: CheckResult;
}> => {
  let names: Set<string>;
  try {
    const rows = await withTimeout(
      greptimeQuery<{ table_name: string }>({
        query: `SELECT table_name FROM information_schema.tables
          WHERE table_schema = DATABASE()
            AND table_name IN ('traces', 'observations', 'scores',
              'traces_metadata', 'observations_metadata', 'scores_metadata', 'traces_tags')`,
        readOnly: true,
      }),
      4000,
    );
    names = new Set(rows.map((row) => row.table_name));
  } catch (error) {
    const fail: CheckResult = {
      name: "greptime",
      status: "fail",
      detail: `cannot reach GreptimeDB: ${(error as Error).message}`,
      fix: FIX.infraUp,
    };
    return {
      connectivity: fail,
      tables: {
        name: "greptime-tables",
        status: "fail",
        detail: "skipped (no connection)",
        fix: FIX.infraUp,
      },
    };
  }

  const missing = REQUIRED_GREPTIME_TABLES.filter((table) => !names.has(table));
  return {
    connectivity: { name: "greptime", status: "pass", detail: "reachable" },
    tables:
      missing.length === 0
        ? {
            name: "greptime-tables",
            status: "pass",
            detail: "traces/observations/scores present",
          }
        : {
            name: "greptime-tables",
            status: "fail",
            detail: `missing tables: ${missing.join(", ")} — migrations not applied`,
            fix: FIX.greptimeMigrate,
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

  const [postgres, migrations, project, greptime, redisCheck, minio, web] =
    await Promise.all([
      checkPostgres(),
      checkMigrations(),
      checkProject(projectId),
      checkGreptime(),
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
    greptime.connectivity,
    greptime.tables,
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

  const [postgres, project, greptime] = await Promise.all([
    checkPostgres(),
    checkProject(opts.projectId),
    checkGreptime(),
  ]);

  // v4 events are not seeded on GreptimeDB (no events table; P3 scope), so needV4
  // no longer gates a table check — scenarios log a note and write the projection only.
  const required: CheckResult[] = [
    postgres,
    project,
    greptime.connectivity,
    greptime.tables,
  ];

  const failed = required.find((check) => check.status === "fail");
  if (failed) {
    throw new SeedError(
      `preflight failed [${failed.name}]: ${failed.detail}`,
      failed.fix,
    );
  }
  opts.log("preflight ok (postgres, project, greptime)");
};
