import { v4 } from "uuid";
import { JobExecutionStatus, prisma } from "@langfuse/shared/src/db";
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
            userId: "user-1", // triggers the eval
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

    await waitForExpect(async () => {
      // we need a second call to the public API with the API key, so that it is stored in redis
      // first call (ingestion above) generates the new, fast API hash
      // second call (below) stores the API key in redis
      const traceUrl = `http://localhost:3000/api/public/traces/${traceId}`;

      const traceResponse = await fetch(traceUrl, {
        headers: {
          Authorization: userApiKeyAuth,
        },
      });

      expect(traceResponse.status).toBe(200);
      expect(traceResponse.body).not.toBeNull();
      expect((await traceResponse.json()).id).toBe(traceId);

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

    // check for eval
    await waitForExpect(async () => {
      const evalExecution = await prisma.jobExecution.findFirst({
        where: {
          jobInputTraceId: traceId,
          projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        },
      });

      expect(evalExecution).not.toBeNull();

      if (!evalExecution) {
        return;
      }

      // failure due to missing openai key in the pipeline. Expected
      expect(evalExecution.status).toBe(JobExecutionStatus.ERROR);
    }, 20000);

    expect(response.status).toBe(207);
  }, 25000);
});

describe("Prompts endpoint", () => {
  it("creates and returns a prompt", async () => {
    const promptName = "prompt-name" + v4();
    const chatMessages = [
      { role: "system", content: "You are a bot" },
      { role: "user", content: "What's up?" },
    ];
    const response = await fetch(
      "http://localhost:3000/api/public/v2/prompts",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: userApiKeyAuth,
        },
        body: JSON.stringify({
          name: promptName,
          prompt: chatMessages,
          type: "chat",
          labels: ["production"],
        }),
      },
    );

    expect(response.status).toBe(201);

    const fetchedPrompt = await fetch(
      `http://localhost:3000/api/public/v2/prompts/${encodeURIComponent(promptName)}`,
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: userApiKeyAuth,
        },
      },
    );
    expect(fetchedPrompt.status).toBe(200);
    expect(fetchedPrompt.body).not.toBeNull();

    if (fetchedPrompt.body === null) {
      return;
    }

    const validatedPrompt = await fetchedPrompt.json();

    expect(validatedPrompt.name).toBe(promptName);

    const redisKey = `prompt:7a88fb47-b4e2-43b8-a06c-a5ce950dc53a:${promptName}:${validatedPrompt.labels[0]}`;
    const redisValue = await redis?.get(redisKey);

    expect(redisValue).not.toBeNull();
    if (!redisValue) {
      return;
    }
    expect(JSON.parse(redisValue)).toEqual(validatedPrompt);
  });
});
