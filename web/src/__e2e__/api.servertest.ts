import { v4 } from "uuid";
import { JobExecutionStatus, Prisma, prisma } from "@langfuse/shared/src/db";
import {
  API_KEY_CACHE_PATTERN,
  AUTHZ_CONTEXT_CACHE_PATTERN,
  getObservationById,
  getTraceById,
  OrgEnrichedApiKey,
  redis,
} from "@langfuse/shared/src/server";
import waitForExpect from "wait-for-expect";

import { type AuthorizationContext } from "@/src/features/auth/policy/types";

const generateAuth = (username: string, password: string) => {
  const auth = Buffer.from(`${username}:${password}`).toString("base64");
  return `Basic ${auth}`;
};

const workerAdminAuth = generateAuth("admin", "myworkerpassword");

const userApiKeyAuth = generateAuth("pk-lf-1234567890", "sk-lf-1234567890");
const projectId = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";

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
  beforeEach(async () => {
    // clear the redis cache
    const keys = await redis?.keys("*");
    if (keys && keys.length > 0) {
      await redis?.del(keys);
    }
  });

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
            timestamp: new Date().toISOString(),
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
            startTime: new Date().toISOString(),
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

    await waitForExpect(
      async () => {
        const traceUrl = `http://localhost:3000/api/public/traces/${traceId}`;

        const traceResponse = await fetch(traceUrl, {
          headers: {
            Authorization: userApiKeyAuth,
          },
        });

        expect(traceResponse.status).toBe(200);
        expect(traceResponse.body).not.toBeNull();
        expect((await traceResponse.json()).id).toBe(traceId);

        const trace = await getTraceById({ traceId, projectId });
        expect(trace).not.toBeNull();
        expect(trace?.name).toBe("test trace");

        const observation = await getObservationById({
          id: spanId,
          projectId,
        });
        expect(observation).not.toBeNull();
        expect(observation?.name).toBe("test span");

        console.log("observationFounds", observation);

        expect(redis).not.toBeNull();

        // Concurrent e2e tests may cache additional API keys — find the seed
        // project's key rather than assuming it is the only one.
        expect(await findCachedPublicKeys(projectId)).toContain(
          "pk-lf-1234567890",
        );
      },
      40000,
      1000,
    );

    // check for eval
    await waitForExpect(
      async () => {
        const evalExecution = await prisma.jobExecution.findFirst({
          where: {
            jobInputTraceId: traceId,
            projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
          },
        });
        console.log("evalExecution", evalExecution);

        expect(evalExecution).not.toBeNull();

        if (!evalExecution) {
          return;
        }

        // failure due to missing openai key in the pipeline. Expected
        expect(evalExecution.status).toBe(JobExecutionStatus.ERROR);
      },
      60000,
      10000,
    );

    expect(response.status).toBe(207);
  }, 70000);

  it("rate limit ingestion", async () => {
    // update the org in the database and set the rate limit to 1 for ingestion
    const org = await prisma.organization.findUnique({
      where: {
        id: "seed-org-id",
      },
    });
    await prisma.organization.update({
      where: {
        id: "seed-org-id",
      },
      data: {
        cloudConfig: {
          ...(typeof org?.cloudConfig === "object" ? org.cloudConfig : {}),
          rateLimitOverrides: [
            {
              resource: "ingestion",
              points: 1,
              durationInSec: 60,
            },
          ],
        },
      },
    });

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
    let responses = [];
    for (let i = 0; i < 10; i++) {
      responses.push(
        await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: userApiKeyAuth,
          },
          body: JSON.stringify(event),
        }),
      );
    }

    // check that at least one of the responses is a 429
    const rateLimitedResponse = responses.find((r) => r.status === 429);
    expect(rateLimitedResponse).not.toBeNull();

    // revert the rate limit on the org
    await prisma.organization.update({
      where: {
        id: "seed-org-id",
      },
      data: {
        cloudConfig: org?.cloudConfig ?? Prisma.JsonNull,
      },
    });
  });
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

    const pattern = `prompt:7a88fb47-b4e2-43b8-a06c-a5ce950dc53a:*:${promptName}:label:${validatedPrompt.labels[0]}`;
    const keys = await redis?.keys(pattern);
    expect(keys?.length).toBe(1);

    const key = keys?.[0] as string;

    const redisValue = await redis?.get(key);

    expect(redisValue).not.toBeNull();
    if (!redisValue) {
      return;
    }
    expect(JSON.parse(redisValue)).toEqual({
      ...validatedPrompt,
      isActive: null, // deprecated isActive is being patched at the endpoint handler level; in Redis it is still null as in DB
    });
  });
});

/** findCachedPublicKeys returns the public keys cached for a project by the legacy api-key cache or the authz context cache, whichever the auth migration mode writes. */
async function findCachedPublicKeys(projectId: string): Promise<string[]> {
  const [legacyKeys, contextKeys] = await Promise.all([
    redis?.keys(API_KEY_CACHE_PATTERN) ?? [],
    redis?.keys(AUTHZ_CONTEXT_CACHE_PATTERN) ?? [],
  ]);
  const [legacyValues, contextValues] = await Promise.all([
    readCacheValues(legacyKeys),
    readCacheValues(contextKeys),
  ]);
  return [
    ...legacyValues.flatMap((v) => legacyPublicKey(v, projectId)),
    ...contextValues.flatMap((v) => contextPublicKey(v, projectId)),
  ];
}

async function readCacheValues(keys: string[]): Promise<unknown[]> {
  const values = await Promise.all(keys.map((k) => redis?.get(k)));
  return values.flatMap((v) => (v ? [JSON.parse(v)] : []));
}

function legacyPublicKey(value: unknown, projectId: string): string[] {
  const apiKey = OrgEnrichedApiKey.safeParse(value);
  return apiKey.success && apiKey.data.projectId === projectId
    ? [apiKey.data.publicKey]
    : [];
}

function contextPublicKey(value: unknown, projectId: string): string[] {
  const principal = (value as CachedContext | null)?.context?.principal;
  return principal?.kind === "apiKey" &&
    principal.boundResource.projectId === projectId
    ? [principal.publicKey]
    : [];
}

type CachedContext = { context?: AuthorizationContext };
