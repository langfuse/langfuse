import { env } from "@/src/env.mjs";
import { prisma } from "@langfuse/shared/src/db";
import {
  clickhouseClient,
  createBasicAuthHeader,
  getQueue,
  IngestionQueue,
  logger,
  OtelIngestionQueue,
  QueueName,
  TraceUpsertQueue,
} from "@langfuse/shared/src/server";
import { type z } from "zod/v4";

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);

const assertLocalUrl = (url: string, serviceName: string) => {
  const parsedUrl = new URL(url);
  if (!LOCAL_HOSTNAMES.has(parsedUrl.hostname)) {
    throw new Error(
      `You cannot prune ${serviceName} unless running against localhost.`,
    );
  }
};

const getWebBaseUrl = () => {
  const defaultPort = process.env.WEB_PORT ?? "3000";
  return (env.NEXTAUTH_URL || `http://localhost:${defaultPort}`)
    .replace(/\/$/, "")
    .replace(/\/api\/auth$/, "");
};

export const getRedisConnectionString = () => {
  if (process.env.REDIS_CONNECTION_STRING) {
    return process.env.REDIS_CONNECTION_STRING;
  }

  const host = process.env.REDIS_HOST ?? "127.0.0.1";
  const port = process.env.REDIS_PORT ?? "6379";
  const password = process.env.REDIS_AUTH ?? "myredissecret";
  const username = process.env.REDIS_USERNAME;

  if (username) {
    return password
      ? `redis://${username}:${password}@${host}:${port}`
      : `redis://${username}@${host}:${port}`;
  }

  return password
    ? `redis://:${password}@${host}:${port}`
    : `redis://${host}:${port}`;
};

export const ensureTestDatabaseExists = async () => {
  const databaseUrl = new URL(env.DATABASE_URL);
  const databaseName = databaseUrl.pathname.slice(1);
  const databaseSchema = databaseUrl.searchParams.get("schema");
  const isTestDatabaseTarget =
    databaseName.includes("langfuse_test") ||
    Boolean(databaseSchema?.includes("test"));

  // Only create test database if we're in test environment with test database URL
  if (!isTestDatabaseTarget || process.env.NODE_ENV !== "test") {
    return; // Not using test database or not in test environment, skip
  }

  try {
    await prisma.$queryRaw`SELECT 1`;
    console.log("Test database already exists and is accessible");

    // Always run migrations to ensure schema is up-to-date
    const { execSync } = await import("child_process");
    const path = await import("path");
    const sharedDir = path.resolve(__dirname, "../../../packages/shared");

    execSync("pnpm run db:migrate", {
      cwd: sharedDir,
      env: { ...process.env, DATABASE_URL: env.DATABASE_URL },
      stdio: "inherit",
    });
    console.log("Test database schema verified/updated");
  } catch {
    console.log("Test database not accessible, creating...");

    const url = new URL(env.DATABASE_URL);
    const dbName = url.pathname.slice(1); // Remove leading slash
    const adminUrl = new URL(env.DATABASE_URL);
    adminUrl.pathname = "/postgres";

    const { PrismaClient } = await import("@prisma/client");
    const adminPrisma = new PrismaClient({
      datasources: {
        db: {
          url: adminUrl.toString(),
        },
      },
    });

    try {
      await adminPrisma.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`);
      console.log(`Created test database: ${dbName}`);

      // Migrations
      const { execSync } = await import("child_process");
      const path = await import("path");
      const sharedDir = path.resolve(__dirname, "../../../packages/shared");

      execSync("pnpm run db:migrate", {
        cwd: sharedDir,
        env: { ...process.env, DATABASE_URL: env.DATABASE_URL },
        stdio: "inherit",
      });
      console.log("Applied migrations to test database");
    } catch (createError: any) {
      if (createError.message?.includes("already exists")) {
        console.log("Test database already exists");
      } else {
        console.error("Failed to create test database:", createError);
      }
    } finally {
      await adminPrisma.$disconnect();
    }
  }

  // ClickHouse schema is expected to be migrated as part of local setup.
};

export const pruneDatabase = async () => {
  assertLocalUrl(env.DATABASE_URL, "database");

  await prisma.scoreConfig.deleteMany();
  await prisma.traceSession.deleteMany();
  await prisma.datasetItem.deleteMany();
  await prisma.dataset.deleteMany();
  await prisma.datasetRuns.deleteMany();
  await prisma.prompt.deleteMany();
  await prisma.promptDependency.deleteMany();
  await prisma.model.deleteMany();
  await prisma.llmApiKeys.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.media.deleteMany();

  await truncateClickhouseTables();
};
export const getQueues = () => {
  const queues: string[] = Object.values(QueueName);
  queues.push(
    ...IngestionQueue.getShardNames(),
    ...TraceUpsertQueue.getShardNames(),
  );

  const listOfQueuesToIgnore = [
    QueueName.DataRetentionQueue,
    QueueName.BlobStorageIntegrationQueue,
    QueueName.DeadLetterRetryQueue,
    QueueName.PostHogIntegrationQueue,
    QueueName.CloudFreeTierUsageThresholdQueue,
  ];

  return queues
    .filter(
      (queueName) => !listOfQueuesToIgnore.includes(queueName as QueueName),
    )
    .map((queueName) =>
      queueName.startsWith(QueueName.IngestionQueue)
        ? IngestionQueue.getInstance({ shardName: queueName })
        : queueName.startsWith(QueueName.TraceUpsert)
          ? TraceUpsertQueue.getInstance({ shardName: queueName })
          : queueName.startsWith(QueueName.OtelIngestionQueue)
            ? OtelIngestionQueue.getInstance({ shardName: queueName })
            : getQueue(
                queueName as Exclude<
                  QueueName,
                  | QueueName.IngestionQueue
                  | QueueName.TraceUpsert
                  | QueueName.OtelIngestionQueue
                >,
              ),
    );
};

export const disconnectQueues = async () => {
  await Promise.all(
    getQueues().map(async (queue) => {
      if (queue) {
        try {
          queue.disconnect();
        } catch (error) {
          logger.error(`Error disconnecting queue ${queue.name}: ${error}`);
        }
      }
    }),
  );
};

export const truncateClickhouseTables = async () => {
  assertLocalUrl(env.CLICKHOUSE_URL, "clickhouse");

  // Additional safety check for test database
  if (env.CLICKHOUSE_DB === "test") {
    console.log(
      "Running tests against test ClickHouse database:",
      env.CLICKHOUSE_DB,
    );
  } else if (env.CLICKHOUSE_DB !== "default") {
    console.log(
      "Running tests against ClickHouse database:",
      env.CLICKHOUSE_DB,
    );
  }

  await clickhouseClient().command({
    query: "TRUNCATE TABLE IF EXISTS observations",
  });
  await clickhouseClient().command({
    query: "TRUNCATE TABLE IF EXISTS scores",
  });
  await clickhouseClient().command({
    query: "TRUNCATE TABLE IF EXISTS traces",
  });
};

export type IngestionAPIResponse = {
  errors: ErrorIngestion[];
  successes: SuccessfulIngestion[];
};

export type SuccessfulIngestion = {
  id: string;
  status: number;
};

export type ErrorIngestion = {
  id: string;
  status: number;
  message: string;
  error: string;
};

export async function makeAPICall<T = IngestionAPIResponse>(
  method: "POST" | "GET" | "PUT" | "DELETE" | "PATCH",
  url: string,
  body?: unknown,
  auth?: string,
  customHeaders?: Record<string, string>,
): Promise<{ body: T; status: number }> {
  const finalUrl = `${getWebBaseUrl()}${url.startsWith("/") ? url : `/${url}`}`;
  const authorization =
    auth || createBasicAuthHeader("pk-lf-1234567890", "sk-lf-1234567890");
  const options = {
    method: method,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json;charset=UTF-8",
      Authorization: authorization,
      ...customHeaders,
    },
    ...(method !== "GET" &&
      body !== undefined && { body: JSON.stringify(body) }),
  };
  const response = await fetch(finalUrl, options);

  // Handle 204 No Content - no body to parse
  if (response.status === 204) {
    return { body: {} as T, status: response.status };
  }

  // Clone the response before attempting to parse JSON
  const clonedResponse = response.clone();

  try {
    const responseBody = (await response.json()) as T;
    return { body: responseBody, status: response.status };
  } catch (error) {
    // Handle JSON parsing errors using the cloned response
    const responseText = await clonedResponse.text();
    throw new Error(
      `Failed to parse JSON response: ${error instanceof Error ? error.message : String(error)}. Response status: ${response.status}. Response headers: ${JSON.stringify(Object.fromEntries(response.headers.entries()))}. Response text: ${responseText}. Method: ${method}, URL: ${finalUrl}, Request body: ${body ? JSON.stringify(body) : "none"}`,
    );
  }
}

export async function makeZodVerifiedAPICall<T extends z.ZodTypeAny>(
  responseZodSchema: T,
  method: "POST" | "GET" | "PUT" | "DELETE" | "PATCH",
  url: string,
  body?: unknown,
  auth?: string,
  statusCode = 200,
): Promise<{ body: z.infer<T>; status: number }> {
  const { body: resBody, status } = await makeAPICall(method, url, body, auth);
  if (status !== statusCode) {
    throw new Error(
      `API call did not return ${statusCode}, returned status ${status}, body ${JSON.stringify(resBody)}`,
    );
  }
  const typeCheckResult = responseZodSchema.safeParse(resBody);
  if (!typeCheckResult.success) {
    console.error(typeCheckResult.error);
    throw new Error(
      `API call (${method} ${url}) did not return valid response, returned status ${status}, body ${JSON.stringify(resBody)}, error ${typeCheckResult.error}`,
    );
  }
  return { body: resBody, status };
}

export async function makeZodVerifiedAPICallSilent<T extends z.ZodTypeAny>(
  responseZodSchema: T,
  method: "POST" | "GET" | "PUT" | "DELETE" | "PATCH",
  url: string,
  body?: unknown,
  auth?: string,
): Promise<{ body: z.infer<T>; status: number }> {
  const { body: resBody, status } = await makeAPICall(method, url, body, auth);

  if (status === 200) {
    const typeCheckResult = responseZodSchema.safeParse(resBody);
    if (!typeCheckResult.success) {
      console.error(typeCheckResult.error);
      throw new Error(
        `API call (${method} ${url}) did not return valid response, returned status ${status}, body ${JSON.stringify(resBody)}, error ${typeCheckResult.error}`,
      );
    }
  }

  return { body: resBody, status };
}
