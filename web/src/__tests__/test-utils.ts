import { getDisplaySecretKey, hashSecretKey } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { hash } from "bcryptjs";

export const pruneDatabase = async () => {
  await prisma.score.deleteMany();
  await prisma.observation.deleteMany();
  await prisma.trace.deleteMany();
  await prisma.datasetItem.deleteMany();
  await prisma.dataset.deleteMany();
  await prisma.datasetRuns.deleteMany();
  await prisma.prompt.deleteMany();
  await prisma.events.deleteMany();
  await prisma.model.deleteMany();
  await prisma.llmApiKeys.deleteMany();
};

export function createBasicAuthHeader(
  username: string,
  password: string,
): string {
  const base64Credentials = Buffer.from(`${username}:${password}`).toString(
    "base64",
  );
  return `Basic ${base64Credentials}`;
}

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

export const setupUserAndProject = async () => {
  const user = await prisma.user.create({
    data: {
      id: "user-1",
      name: "Demo User",
      email: "demo@langfuse.com",
      password: await hash("password", 12),
    },
  });

  const project = await prisma.project.create({
    data: {
      id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
      name: "llm-app",
      apiKeys: {
        create: [
          {
            note: "seeded key",
            hashedSecretKey: await hashSecretKey("sk-lf-1234567890"),
            displaySecretKey: getDisplaySecretKey("sk-lf-1234567890"),
            publicKey: "pk-lf-1234567890",
          },
        ],
      },
      projectMembers: {
        create: {
          role: "OWNER",
          userId: user.id,
        },
      },
    },
  });
  return { user, project };
};
