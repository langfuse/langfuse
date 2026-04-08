import { env } from "@/src/env.mjs";
import { prisma } from "@langfuse/shared/src/db";
import {
  createShaHash,
  DatasetDeleteQueue,
  EvalExecutionQueue,
  LLMAsJudgeExecutionQueue,
  SecondaryEvalExecutionQueue,
  SecondaryIngestionQueue,
  createBasicAuthHeader,
  getDisplaySecretKey,
  getQueue,
  hashSecretKey,
  IngestionQueue,
  invalidateCachedProjectApiKeys,
  logger,
  OtelIngestionQueue,
  QueueName,
  ScoreDeleteQueue,
  TraceDeleteQueue,
  TraceUpsertQueue,
} from "@langfuse/shared/src/server";
import { type z } from "zod";

const DEFAULT_TEST_ORG_ID = "seed-org-id";
const DEFAULT_TEST_PROJECT_ID = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";
const DEFAULT_TEST_PUBLIC_KEY = "pk-lf-1234567890";
const DEFAULT_TEST_SECRET_KEY = "sk-lf-1234567890";
const TEST_DATABASE_SETUP_ENV_KEY = "__LANGFUSE_TEST_DATABASE_READY";
const DEFAULT_TEST_PROJECT_SETUP_ENV_KEY =
  "__LANGFUSE_DEFAULT_TEST_PROJECT_READY";

type TestSetupProcess = typeof process & {
  __langfuseDefaultTestProjectSetupPromise?: Promise<void>;
  __langfuseDefaultTestProjectReady?: boolean;
  __langfuseInlineIngestionProcessingPromise?: Promise<void>;
  __langfuseTestDatabaseSetupPromise?: Promise<void>;
  __langfuseTestDatabaseReady?: boolean;
};

const testSetupProcess = process as TestSetupProcess;

const getSetupMarkerPath = async (name: string) => {
  const { tmpdir } = await import("os");
  const path = await import("path");

  return path.join(tmpdir(), name);
};

const hasSetupMarker = async (name: string) => {
  const { stat } = await import("fs/promises");

  try {
    await stat(await getSetupMarkerPath(name));
    return true;
  } catch {
    return false;
  }
};

const writeSetupMarker = async (name: string) => {
  const { mkdir, writeFile } = await import("fs/promises");
  const path = await import("path");

  const markerPath = await getSetupMarkerPath(name);
  await mkdir(path.dirname(markerPath), { recursive: true });
  await writeFile(markerPath, new Date().toISOString(), "utf8");
};

const removeSetupMarker = async (name: string) => {
  const { unlink } = await import("fs/promises");

  try {
    await unlink(await getSetupMarkerPath(name));
  } catch {
    // best effort cleanup only
  }
};

const getDatabaseSetupMarkerName = async () => {
  const { readFile } = await import("fs/promises");
  const path = await import("path");

  const prismaSchemaPath = path.resolve(
    __dirname,
    "../../../packages/shared/prisma/schema.prisma",
  );
  const prismaSchema = await readFile(prismaSchemaPath, "utf8");

  return `langfuse-test-db-ready-${createShaHash(
    `${env.DATABASE_URL}:${prismaSchema}`,
    env.SALT,
  )}`;
};

const getDefaultProjectSetupMarkerName = () =>
  `langfuse-test-project-ready-${createShaHash(
    `${env.DATABASE_URL}:${DEFAULT_TEST_PROJECT_ID}:${DEFAULT_TEST_PUBLIC_KEY}`,
    env.SALT,
  )}`;

const isTransientConnectionPressureError = (error: unknown) =>
  error instanceof Error && /too many clients already/i.test(error.message);

const isDefaultTestProjectReady = async () => {
  const [organization, project, apiKey] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: DEFAULT_TEST_ORG_ID },
      select: { id: true },
    }),
    prisma.project.findUnique({
      where: { id: DEFAULT_TEST_PROJECT_ID },
      select: { id: true, orgId: true },
    }),
    prisma.apiKey.findUnique({
      where: { publicKey: DEFAULT_TEST_PUBLIC_KEY },
      select: { projectId: true },
    }),
  ]);

  return (
    organization?.id === DEFAULT_TEST_ORG_ID &&
    project?.id === DEFAULT_TEST_PROJECT_ID &&
    project?.orgId === DEFAULT_TEST_ORG_ID &&
    apiKey?.projectId === DEFAULT_TEST_PROJECT_ID
  );
};

export const ensureTestDatabaseExists = async () => {
  // Only create test database if we're in test environment with test database URL
  if (
    !env.DATABASE_URL.includes("langfuse_test") ||
    process.env.NODE_ENV !== "test"
  ) {
    return; // Not using test database or not in test environment, skip
  }

  if (testSetupProcess.__langfuseTestDatabaseReady) {
    return;
  }

  if (process.env[TEST_DATABASE_SETUP_ENV_KEY] === "1") {
    testSetupProcess.__langfuseTestDatabaseReady = true;
    return;
  }

  const databaseSetupMarkerName = await getDatabaseSetupMarkerName();
  if (await hasSetupMarker(databaseSetupMarkerName)) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      process.env[TEST_DATABASE_SETUP_ENV_KEY] = "1";
      testSetupProcess.__langfuseTestDatabaseReady = true;
      return;
    } catch (error) {
      if (isTransientConnectionPressureError(error)) {
        process.env[TEST_DATABASE_SETUP_ENV_KEY] = "1";
        testSetupProcess.__langfuseTestDatabaseReady = true;
        return;
      }

      await removeSetupMarker(databaseSetupMarkerName);
    }
  }

  if (!testSetupProcess.__langfuseTestDatabaseSetupPromise) {
    testSetupProcess.__langfuseTestDatabaseSetupPromise = (async () => {
      try {
        await prisma.$queryRaw`SELECT 1`;
        console.log("Test database already exists and is accessible");

        // Always run migrations to ensure schema is up-to-date once per Jest process.
        const { execSync } = await import("child_process");
        const path = await import("path");
        const sharedDir = path.resolve(__dirname, "../../../packages/shared");

        execSync("pnpm run db:migrate", {
          cwd: sharedDir,
          env: { ...process.env, DATABASE_URL: env.DATABASE_URL },
          stdio: "inherit",
        });
        console.log("Test database schema verified/updated");
        await writeSetupMarker(databaseSetupMarkerName);
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
          await writeSetupMarker(databaseSetupMarkerName);
        } catch (createError: any) {
          if (createError.message?.includes("already exists")) {
            console.log("Test database already exists");

            const { execSync } = await import("child_process");
            const path = await import("path");
            const sharedDir = path.resolve(
              __dirname,
              "../../../packages/shared",
            );

            execSync("pnpm run db:migrate", {
              cwd: sharedDir,
              env: { ...process.env, DATABASE_URL: env.DATABASE_URL },
              stdio: "inherit",
            });
            console.log("Test database schema verified/updated");
            await writeSetupMarker(databaseSetupMarkerName);
          } else {
            console.error("Failed to create test database:", createError);
          }
        } finally {
          await adminPrisma.$disconnect();
        }
      }

      process.env[TEST_DATABASE_SETUP_ENV_KEY] = "1";
      testSetupProcess.__langfuseTestDatabaseReady = true;
    })().catch((error) => {
      delete process.env[TEST_DATABASE_SETUP_ENV_KEY];
      delete testSetupProcess.__langfuseTestDatabaseReady;
      void removeSetupMarker(databaseSetupMarkerName);
      delete testSetupProcess.__langfuseTestDatabaseSetupPromise;
      throw error;
    });
  }

  await testSetupProcess.__langfuseTestDatabaseSetupPromise;

  // ClickHouse uses default database (no setup needed)
};

export const ensureDefaultTestProjectExists = async () => {
  if (testSetupProcess.__langfuseDefaultTestProjectReady) {
    return;
  }

  if (process.env[DEFAULT_TEST_PROJECT_SETUP_ENV_KEY] === "1") {
    testSetupProcess.__langfuseDefaultTestProjectReady = true;
    return;
  }

  const defaultProjectSetupMarkerName = getDefaultProjectSetupMarkerName();
  if (await hasSetupMarker(defaultProjectSetupMarkerName)) {
    try {
      if (await isDefaultTestProjectReady()) {
        process.env[DEFAULT_TEST_PROJECT_SETUP_ENV_KEY] = "1";
        testSetupProcess.__langfuseDefaultTestProjectReady = true;
        return;
      }

      await removeSetupMarker(defaultProjectSetupMarkerName);
    } catch (error) {
      if (isTransientConnectionPressureError(error)) {
        // Under high suite concurrency, this check can fail transiently due to
        // connection pressure even though the seed project is already present.
        process.env[DEFAULT_TEST_PROJECT_SETUP_ENV_KEY] = "1";
        testSetupProcess.__langfuseDefaultTestProjectReady = true;
        return;
      }

      await removeSetupMarker(defaultProjectSetupMarkerName);
    }
  }

  if (!testSetupProcess.__langfuseDefaultTestProjectSetupPromise) {
    testSetupProcess.__langfuseDefaultTestProjectSetupPromise = (async () => {
      const fastHashedSecretKey = createShaHash(
        DEFAULT_TEST_SECRET_KEY,
        env.SALT,
      );
      const hashedSecretKey = await hashSecretKey(DEFAULT_TEST_SECRET_KEY);

      await prisma.$transaction(async (tx) => {
        await tx.organization.upsert({
          where: { id: DEFAULT_TEST_ORG_ID },
          update: {
            name: "Seed Org",
            cloudConfig: {
              plan: "Team",
            },
          },
          create: {
            id: DEFAULT_TEST_ORG_ID,
            name: "Seed Org",
            cloudConfig: {
              plan: "Team",
            },
          },
        });

        await tx.project.upsert({
          where: { id: DEFAULT_TEST_PROJECT_ID },
          update: {
            name: "Seed Project",
            orgId: DEFAULT_TEST_ORG_ID,
          },
          create: {
            id: DEFAULT_TEST_PROJECT_ID,
            name: "Seed Project",
            orgId: DEFAULT_TEST_ORG_ID,
          },
        });

        await tx.apiKey.upsert({
          where: { publicKey: DEFAULT_TEST_PUBLIC_KEY },
          update: {
            projectId: DEFAULT_TEST_PROJECT_ID,
            scope: "PROJECT",
            fastHashedSecretKey,
            hashedSecretKey,
            displaySecretKey: getDisplaySecretKey(DEFAULT_TEST_SECRET_KEY),
          },
          create: {
            publicKey: DEFAULT_TEST_PUBLIC_KEY,
            projectId: DEFAULT_TEST_PROJECT_ID,
            scope: "PROJECT",
            fastHashedSecretKey,
            hashedSecretKey,
            displaySecretKey: getDisplaySecretKey(DEFAULT_TEST_SECRET_KEY),
          },
        });
      });

      await invalidateCachedProjectApiKeys(DEFAULT_TEST_PROJECT_ID);
      process.env[DEFAULT_TEST_PROJECT_SETUP_ENV_KEY] = "1";
      testSetupProcess.__langfuseDefaultTestProjectReady = true;
      await writeSetupMarker(defaultProjectSetupMarkerName);
    })().catch((error) => {
      delete process.env[DEFAULT_TEST_PROJECT_SETUP_ENV_KEY];
      delete testSetupProcess.__langfuseDefaultTestProjectReady;
      void removeSetupMarker(defaultProjectSetupMarkerName);
      delete testSetupProcess.__langfuseDefaultTestProjectSetupPromise;
      throw error;
    });
  }

  await testSetupProcess.__langfuseDefaultTestProjectSetupPromise;
};

export const getQueues = () => {
  const queues: string[] = Object.values(QueueName);
  queues.push(
    ...IngestionQueue.getShardNames(),
    ...SecondaryIngestionQueue.getShardNames(),
    ...EvalExecutionQueue.getShardNames(),
    ...SecondaryEvalExecutionQueue.getShardNames(),
    ...LLMAsJudgeExecutionQueue.getShardNames(),
    ...OtelIngestionQueue.getShardNames(),
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
        : queueName.startsWith(QueueName.IngestionSecondaryQueue)
          ? SecondaryIngestionQueue.getInstance({ shardName: queueName })
          : queueName.startsWith(QueueName.EvaluationExecution)
            ? EvalExecutionQueue.getInstance({ shardName: queueName })
            : queueName.startsWith(QueueName.EvaluationExecutionSecondaryQueue)
              ? SecondaryEvalExecutionQueue.getInstance({
                  shardName: queueName,
                })
              : queueName.startsWith(QueueName.LLMAsJudgeExecution)
                ? LLMAsJudgeExecutionQueue.getInstance({
                    shardName: queueName,
                  })
                : queueName.startsWith(QueueName.TraceUpsert)
                  ? TraceUpsertQueue.getInstance({ shardName: queueName })
                  : queueName.startsWith(QueueName.OtelIngestionQueue)
                    ? OtelIngestionQueue.getInstance({ shardName: queueName })
                    : getQueue(
                        queueName as Exclude<
                          QueueName,
                          | QueueName.IngestionQueue
                          | QueueName.IngestionSecondaryQueue
                          | QueueName.EvaluationExecution
                          | QueueName.EvaluationExecutionSecondaryQueue
                          | QueueName.LLMAsJudgeExecution
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

const shouldProcessIngestionJobsInline = (
  method: "POST" | "GET" | "PUT" | "DELETE" | "PATCH",
  url: string,
  status: number,
) => {
  const isLegacyPublicEventRoute =
    status === 200 &&
    ((method === "POST" &&
      (url.startsWith("/api/public/traces") ||
        url.startsWith("/api/public/generations") ||
        url.startsWith("/api/public/spans") ||
        url.startsWith("/api/public/events") ||
        url.startsWith("/api/public/scores"))) ||
      (method === "PATCH" &&
        (url.startsWith("/api/public/generations") ||
          url.startsWith("/api/public/spans"))));

  return (
    isLegacyPublicEventRoute ||
    (method === "POST" &&
      ((url.startsWith("/api/public/ingestion") && status === 207) ||
        (url.startsWith("/api/public/dataset-run-items") && status === 200)))
  );
};

const shouldProcessScoreDeleteJobsInline = (
  method: "POST" | "GET" | "PUT" | "DELETE" | "PATCH",
  url: string,
  status: number,
) =>
  method === "DELETE" &&
  url.startsWith("/api/public/scores/") &&
  status === 202;

const shouldProcessTraceDeleteJobsInline = (
  method: "POST" | "GET" | "PUT" | "DELETE" | "PATCH",
  url: string,
  status: number,
) =>
  method === "DELETE" && url.startsWith("/api/public/traces") && status === 200;

const shouldProcessOtelIngestionJobsInline = (
  method: "POST" | "GET" | "PUT" | "DELETE" | "PATCH",
  url: string,
  status: number,
) =>
  method === "POST" &&
  url.startsWith("/api/public/otel/v1/traces") &&
  status === 200;

const shouldProcessDatasetDeleteJobsInline = (
  method: "POST" | "GET" | "PUT" | "DELETE" | "PATCH",
  url: string,
  status: number,
) =>
  method === "DELETE" &&
  url.startsWith("/api/public/datasets/") &&
  url.includes("/runs/") &&
  status === 200;

const processQueuedIngestionJobsInline = async () => {
  const { ingestionQueueProcessorBuilder } =
    await import("../../../worker/src/queues/ingestionQueue");
  const { ClickhouseWriter } =
    await import("../../../worker/src/services/ClickhouseWriter");

  const primaryProcessor = ingestionQueueProcessorBuilder(true);
  const secondaryProcessor = ingestionQueueProcessorBuilder(false);

  let processedJobCount = 0;
  type InlineQueueProcessor = (job: { data: unknown }) => Promise<unknown>;

  const drainQueue = async (
    queueFactory: (
      shardName: string,
    ) => ReturnType<typeof IngestionQueue.getInstance>,
    shardNames: string[],
    processor: InlineQueueProcessor,
  ) => {
    for (const shardName of shardNames) {
      const queue = queueFactory(shardName);
      if (!queue) continue;

      while (true) {
        const jobs = await queue.getJobs(
          ["waiting", "delayed", "prioritized"],
          0,
          50,
          true,
        );

        if (jobs.length === 0) {
          break;
        }

        for (const job of jobs) {
          await processor({ data: job.data } as any);
          processedJobCount += 1;
          await job.remove();
        }
      }
    }
  };

  await drainQueue(
    (shardName) => IngestionQueue.getInstance({ shardName }),
    IngestionQueue.getShardNames(),
    primaryProcessor,
  );

  await drainQueue(
    (shardName) => SecondaryIngestionQueue.getInstance({ shardName }),
    SecondaryIngestionQueue.getShardNames(),
    secondaryProcessor,
  );

  if (processedJobCount > 0) {
    await ClickhouseWriter.getInstance().shutdown();
  }
};

const processIngestionJobsInlineOnce = async () => {
  const pendingInlineProcessing =
    testSetupProcess.__langfuseInlineIngestionProcessingPromise ??
    processQueuedIngestionJobsInline();

  testSetupProcess.__langfuseInlineIngestionProcessingPromise =
    pendingInlineProcessing.finally(() => {
      delete testSetupProcess.__langfuseInlineIngestionProcessingPromise;
    });

  await testSetupProcess.__langfuseInlineIngestionProcessingPromise;
};

const processQueuedScoreDeleteJobsInline = async () => {
  const { scoreDeleteProcessor } =
    await import("../../../worker/src/queues/scoreDelete");

  const queue = ScoreDeleteQueue.getInstance();
  if (!queue) {
    return;
  }

  const jobs = await queue.getJobs(["waiting", "delayed", "prioritized"]);
  for (const job of jobs) {
    await scoreDeleteProcessor({ data: job.data } as any);
    await job.remove();
  }
};

const processQueuedTraceDeleteJobsInline = async () => {
  const { traceDeleteProcessor } =
    await import("../../../worker/src/queues/traceDelete");

  const queue = TraceDeleteQueue.getInstance();
  if (!queue) {
    return;
  }

  while (true) {
    const jobs = await queue.getJobs(["waiting", "delayed", "prioritized"]);
    if (jobs.length === 0) {
      break;
    }

    for (const job of jobs) {
      await traceDeleteProcessor({ data: job.data } as any);
      await job.remove();
    }
  }
};

const processQueuedOtelIngestionJobsInline = async () => {
  const { otelIngestionQueueProcessor } =
    await import("../../../worker/src/queues/otelIngestionQueue");
  const { ClickhouseWriter } =
    await import("../../../worker/src/services/ClickhouseWriter");

  let processedJobCount = 0;

  for (const shardName of OtelIngestionQueue.getShardNames()) {
    const queue = OtelIngestionQueue.getInstance({ shardName });
    if (!queue) continue;

    while (true) {
      const jobs = await queue.getJobs(
        ["waiting", "delayed", "prioritized"],
        0,
        50,
        true,
      );

      if (jobs.length === 0) {
        break;
      }

      for (const job of jobs) {
        await otelIngestionQueueProcessor({ data: job.data } as any);
        processedJobCount += 1;
        await job.remove();
      }
    }
  }

  if (processedJobCount > 0) {
    await ClickhouseWriter.getInstance().shutdown();
    await processIngestionJobsInlineOnce();
  }
};

const processQueuedDatasetDeleteJobsInline = async () => {
  const { datasetDeleteProcessor } =
    await import("../../../worker/src/queues/datasetDelete");

  const queue = DatasetDeleteQueue.getInstance();
  if (!queue) {
    return;
  }

  while (true) {
    const jobs = await queue.getJobs(["waiting", "delayed", "prioritized"]);
    if (jobs.length === 0) {
      break;
    }

    for (const job of jobs) {
      await datasetDeleteProcessor({ data: job.data } as any);
      await job.remove();
    }
  }
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
  const finalUrl = `http://localhost:3000${url.startsWith("/") ? url : `/${url}`}`;
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

    if (shouldProcessIngestionJobsInline(method, url, response.status)) {
      await processIngestionJobsInlineOnce();
    }

    if (shouldProcessScoreDeleteJobsInline(method, url, response.status)) {
      await processQueuedScoreDeleteJobsInline();
    }

    if (shouldProcessTraceDeleteJobsInline(method, url, response.status)) {
      await processQueuedTraceDeleteJobsInline();
    }

    if (shouldProcessOtelIngestionJobsInline(method, url, response.status)) {
      await processQueuedOtelIngestionJobsInline();
    }

    if (shouldProcessDatasetDeleteJobsInline(method, url, response.status)) {
      await processQueuedDatasetDeleteJobsInline();
    }

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
