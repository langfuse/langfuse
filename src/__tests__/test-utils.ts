import {
  hashSecretKey,
  getDisplaySecretKey,
} from "@/src/features/public-api/lib/apiKeys";
import { prisma } from "@/src/server/db";
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

export async function makeAPICall(
  method: "POST" | "GET" | "PUT" | "DELETE" | "PATCH",
  url: string,
  body?: unknown,
) {
  const finalUrl = `http://localhost:3000/${url}`;
  const options = {
    method: method,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json;charset=UTF-8",
      Authorization: createBasicAuthHeader(
        "pk-lf-1234567890",
        "sk-lf-1234567890",
      ),
    },
    // Conditionally include the body property if the method is not "GET"
    ...(method !== "GET" &&
      body !== undefined && { body: JSON.stringify(body) }),
  };
  const a = await fetch(finalUrl, options);

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  return { body: await a.json(), status: a.status };
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
      members: {
        create: {
          role: "OWNER",
          userId: user.id,
        },
      },
    },
  });
  return { user, project };
};
