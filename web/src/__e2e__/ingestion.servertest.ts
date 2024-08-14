import { v4 } from "uuid";
import { prisma } from "@langfuse/shared/src/db";
import { redis } from "@langfuse/shared/src/server";
import waitForExpect from "wait-for-expect";
import { ApiKeyZod } from "@/src/features/public-api/server/apiAuth";

const generateAuth = (username: string, password: string) => {
  const auth = Buffer.from(`${username}:${password}`).toString("base64");
  return `Basic ${auth}`;
};

const workerAdminAuth = generateAuth("admin", "myworkerpassword");

const userApiKeyAuth = generateAuth("pk-lf-1234567890", "sk-lf-1234567890");

describe("Health endpoints", () => {
  it("web container returns healthy", async () => {
    // Arrange
    const url = "http://localhost:3000/api/public/health";

    // Act
    const response = await fetch(url);
    expect(response.status).toBe(200);
  });

  it("worker container returns healthy", async () => {
    // Arrange
    const url = "http://localhost:3030/api/health";

    // Act
    const response = await fetch(url, {
      headers: {
        Authorization: workerAdminAuth,
      },
    });
    expect(response.status).toBe(200);
  });
});

describe("Ingestion Pipeline", () => {
  it("ingest a trace", async () => {
    const traceId = v4();
    const spanId = v4();

    const event = {
      batch: [
        {
          id: v4(),
          type: "trace-create",
          timestamp: new Date().toISOString(),
          body: {
            name: "test trace",
            id: traceId,
          },
        },
        {
          id: v4(),
          type: "span-create",
          timestamp: new Date().toISOString(),
          body: {
            id: spanId,
            traceId: traceId,
            name: "test span",
          },
        },
      ],
    };
    // Arrange
    const url = "http://localhost:3000/api/public/ingestion";

    // Act
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: userApiKeyAuth,
      },
      body: JSON.stringify(event),
    });

    // poll until 10 seconds, until condition is met
    await waitForExpect(async () => {
      const trace = await prisma.trace.findUnique({
        where: {
          id: traceId,
        },
      });
      expect(trace).not.toBeNull();
      expect(trace?.name).toBe("test trace");

      const observation = await prisma.observation.findUnique({
        where: {
          id: spanId,
          traceId: traceId,
        },
      });
      expect(observation).not.toBeNull();
      expect(observation?.name).toBe("test span");

      expect(redis).not.toBeNull();

      const redisKeys = await redis?.keys(`api-key:*`);
      expect(redisKeys?.length).toBe(1);
      const redisValue = await redis?.get(redisKeys![0]);

      const llmApiKey = ApiKeyZod.parse(JSON.parse(redisValue!));
      expect(llmApiKey.projectId).toBe("7a88fb47-b4e2-43b8-a06c-a5ce950dc53a");
    });

    expect(response.status).toBe(207);
  }, 10000);
});
