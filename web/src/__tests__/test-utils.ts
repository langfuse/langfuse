import { env } from "@/src/env.mjs";
import { prisma } from "@langfuse/shared/src/db";
import {
  clickhouseClient,
  createBasicAuthHeader,
} from "@langfuse/shared/src/server";
import { type z } from "zod/v4";

export const ensureTestDatabaseExists = async () => {
  // Only create test database if we're in test environment with test database URL
  if (
    !env.DATABASE_URL.includes("langfuse_test") ||
    process.env.NODE_ENV !== "test"
  ) {
    return; // Not using test database or not in test environment, skip
  }

  try {
    await prisma.$queryRaw`SELECT 1`;
    console.log("Test database already exists and is accessible");
  } catch (error) {
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

  await ensureClickHouseTestDatabaseExists();
  await ensureMinIOTestBucketsExist();
};

export const ensureClickHouseTestDatabaseExists = async () => {
  // Only set up ClickHouse test database if we're in test environment with test database
  if (
    !env.DATABASE_URL.includes("langfuse_test") ||
    !env.CLICKHOUSE_DB ||
    process.env.NODE_ENV !== "test"
  ) {
    return;
  }

  try {
    const { createClient } = await import("@clickhouse/client");

    const defaultClient = createClient({
      url: env.CLICKHOUSE_URL,
      username: env.CLICKHOUSE_USER,
      password: env.CLICKHOUSE_PASSWORD,
      database: "default", // Connect to default database to create test database
    });

    try {
      // Create the test database if it doesn't exist
      await defaultClient.command({
        query: `CREATE DATABASE IF NOT EXISTS ${env.CLICKHOUSE_DB}`,
      });
      console.log(`Created ClickHouse test database: ${env.CLICKHOUSE_DB}`);
    } catch (createDbError: any) {
      console.log(
        "Database creation failed or already exists:",
        createDbError.message,
      );
    }

    const testClient = createClient({
      url: env.CLICKHOUSE_URL,
      username: env.CLICKHOUSE_USER,
      password: env.CLICKHOUSE_PASSWORD,
      database: env.CLICKHOUSE_DB,
    });
    await testClient.command({
      query: "SELECT 1",
    });

    // Check if the main tables exist
    const tablesResult = await testClient.query({
      query: "SHOW TABLES",
    });

    const tables = await tablesResult.json();
    const tableNames = tables.data.map((row: any) => row.name);

    const requiredTables = ["traces", "observations", "scores"];
    const missingTables = requiredTables.filter(
      (table) => !tableNames.includes(table),
    );

    if (missingTables.length > 0) {
      console.log(
        `Missing ClickHouse tables: ${missingTables.join(", ")}, running migrations...`,
      );

      // Run ClickHouse migrations
      const { execSync } = await import("child_process");
      const path = await import("path");
      const sharedDir = path.resolve(__dirname, "../../../packages/shared");

      execSync("pnpm run ch:up", {
        cwd: sharedDir,
        env: process.env,
        stdio: "inherit",
      });
      console.log("Applied ClickHouse migrations to test database");
    } else {
      console.log(
        "ClickHouse test database already exists and has required tables",
      );
    }
  } catch (error) {
    console.log("ClickHouse test database setup failed:", error);

    try {
      // As a fallback, try to run migrations which might create the database
      const { execSync } = await import("child_process");
      const path = await import("path");
      const sharedDir = path.resolve(__dirname, "../../../packages/shared");

      execSync("pnpm run ch:up", {
        cwd: sharedDir,
        env: process.env,
        stdio: "inherit",
      });
      console.log("Created ClickHouse test database and applied migrations");
    } catch (createError: any) {
      console.error("Failed to create ClickHouse test database:", createError);
      throw createError;
    }
  }
};

export const ensureMinIOTestBucketsExist = async () => {
  // Only set up MinIO test buckets if we're in test environment with test database
  if (
    !env.DATABASE_URL.includes("langfuse_test") ||
    process.env.NODE_ENV !== "test"
  ) {
    return;
  }

  // Check if MinIO S3 media upload is configured (only service defined in web env)
  if (
    !env.LANGFUSE_S3_MEDIA_UPLOAD_BUCKET ||
    !env.LANGFUSE_S3_MEDIA_UPLOAD_ENDPOINT
  ) {
    console.log(
      "MinIO S3 media upload not configured, skipping bucket creation",
    );
    return;
  }

  try {
    const { S3Client, CreateBucketCommand, HeadBucketCommand } = await import(
      "@aws-sdk/client-s3"
    );

    // Create S3 client for MinIO using media upload configuration
    const s3Client = new S3Client({
      endpoint: env.LANGFUSE_S3_MEDIA_UPLOAD_ENDPOINT,
      region: env.LANGFUSE_S3_MEDIA_UPLOAD_REGION || "us-east-1",
      credentials: {
        accessKeyId: env.LANGFUSE_S3_MEDIA_UPLOAD_ACCESS_KEY_ID!,
        secretAccessKey: env.LANGFUSE_S3_MEDIA_UPLOAD_SECRET_ACCESS_KEY!,
      },
      forcePathStyle: env.LANGFUSE_S3_MEDIA_UPLOAD_FORCE_PATH_STYLE === "true",
    });

    const bucket = env.LANGFUSE_S3_MEDIA_UPLOAD_BUCKET;

    try {
      // Check if bucket exists
      await s3Client.send(new HeadBucketCommand({ Bucket: bucket }));
      console.log(`MinIO bucket '${bucket}' already exists`);
    } catch (error: any) {
      if (
        error.name === "NotFound" ||
        error.$metadata?.httpStatusCode === 404
      ) {
        // Bucket doesn't exist, create it
        await s3Client.send(new CreateBucketCommand({ Bucket: bucket }));
        console.log(`Created MinIO bucket: ${bucket}`);
      } else {
        console.error(`Error checking MinIO bucket '${bucket}':`, error);
      }
    }
  } catch (error) {
    console.error("Failed to set up MinIO test buckets:", error);
    // Don't throw error MinIO optional for some tests
  }
};

export const pruneDatabase = async () => {
  if (!env.DATABASE_URL.includes("localhost:5432")) {
    throw new Error("You cannot prune database unless running on localhost.");
  }

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

export const truncateClickhouseTables = async () => {
  if (!env.CLICKHOUSE_URL?.includes("localhost:8123")) {
    throw new Error("You cannot prune clickhouse unless running on localhost.");
  }

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
    },
    ...(method !== "GET" &&
      body !== undefined && { body: JSON.stringify(body) }),
  };
  const response = await fetch(finalUrl, options);

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
