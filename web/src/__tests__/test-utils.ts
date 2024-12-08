import { env } from "@/src/env.mjs";
import { prisma } from "@langfuse/shared/src/db";
import {
  clickhouseClient,
  createBasicAuthHeader,
} from "@langfuse/shared/src/server";
import { type z } from "zod";

export const pruneDatabase = async () => {
  if (!env.DATABASE_URL.includes("localhost:5432")) {
    throw new Error("You cannot prune database unless running on localhost.");
  }

  await prisma.score.deleteMany();
  await prisma.scoreConfig.deleteMany();
  await prisma.observation.deleteMany();
  await prisma.trace.deleteMany();
  await prisma.traceSession.deleteMany();
  await prisma.datasetItem.deleteMany();
  await prisma.dataset.deleteMany();
  await prisma.datasetRuns.deleteMany();
  await prisma.prompt.deleteMany();
  await prisma.events.deleteMany();
  await prisma.model.deleteMany();
  await prisma.llmApiKeys.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.media.deleteMany();

  if (!env.CLICKHOUSE_URL?.includes("localhost:8123")) {
    throw new Error("You cannot prune clickhouse unless running on localhost.");
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
  const finalUrl = `http://localhost:3000/${url}`;
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
  const responseBody = (await response.json()) as T;
  return { body: responseBody, status: response.status };
}

export async function makeZodVerifiedAPICall<T extends z.ZodTypeAny>(
  responseZodSchema: T,
  method: "POST" | "GET" | "PUT" | "DELETE" | "PATCH",
  url: string,
  body?: unknown,
  auth?: string,
): Promise<{ body: z.infer<T>; status: number }> {
  const { body: resBody, status } = await makeAPICall(method, url, body, auth);
  if (status !== 200) {
    throw new Error(
      `API call did not return 200, returned status ${status}, body ${JSON.stringify(resBody)}`,
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
