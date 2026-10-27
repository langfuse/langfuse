import { testFeatureFlags } from "@/src/__tests__/fixtures/feature-flags";
import { type ChildProcess, spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { Session } from "next-auth";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import waitForExpect from "wait-for-expect";
import { z } from "zod/v4";

import { env } from "@/src/env.mjs";
import { $root } from "@/src/pages/api/public/otel/otlp-proto/generated/root";
import {
  type GatewayApiFormat,
  GatewayResolveResponseSchema,
} from "@/src/features/ai-gateway/server/provider";
import type { GatewayProviderName } from "@/src/features/ai-gateway/server/provider/registry";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import { signHmacSha256 } from "@/src/server/utils/hmac";
import { encrypt } from "@langfuse/shared/encryption";
import {
  GatewayConnectionStatus,
  GatewayIngestionMode,
  GatewayProvider,
  prisma,
  Role,
} from "@langfuse/shared/src/db";
import {
  getObservationByIdFromEventsTable,
  getTraceByIdFromEventsTable,
  queryClickhouse,
  redis,
  UsageDetails,
} from "@langfuse/shared/src/server";
import { getDisplaySecretKey } from "@langfuse/shared/src/server/auth/apiKeys";

const BASE_URL = (
  process.env.LANGFUSE_AI_GATEWAY_E2E_BASE_URL ?? "http://localhost:3000"
).replace(/\/$/, "");
const ORGANIZATION_ID =
  process.env.LANGFUSE_AI_GATEWAY_E2E_ORGANIZATION_ID ?? "seed-org-id";
const PROJECT_ID_OVERRIDE = process.env.LANGFUSE_AI_GATEWAY_E2E_PROJECT_ID;
const DEFAULT_PROJECT_ID = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";
const RESOLVE_PATH = "/api/internal/ai-gateway/v1/resolve";
const TEST_TIMEOUT_MS = 120_000;
const PROVIDER_CREDENTIALS: Partial<Record<GatewayProviderName, string>> = {
  OPENAI: process.env.LANGFUSE_LLM_CONNECTION_OPENAI_KEY,
  ANTHROPIC: process.env.LANGFUSE_LLM_CONNECTION_ANTHROPIC_KEY,
};
const ENABLED_PROVIDERS = Object.values(GatewayProvider);

// Public catalog routes. Chat completions has no separate models route; the
// OpenAI route lists the responses catalog.
const GATEWAY_MODEL_ROUTES = [
  {
    provider: GatewayProvider.OPENAI,
    apiFormat: "openai.responses",
    path: "/openai/v1/models",
  },
  {
    provider: GatewayProvider.ANTHROPIC,
    apiFormat: "anthropic.messages",
    path: "/anthropic/v1/models",
  },
] as const satisfies ReadonlyArray<{
  provider: GatewayProviderName;
  apiFormat: GatewayApiFormat;
  path: string;
}>;

const openAiModelListSchema = z
  .object({
    object: z.literal("list"),
    data: z
      .array(
        z
          .object({
            id: z.string().min(1),
            object: z.literal("model"),
            created: z.number().int().nonnegative(),
            owned_by: z.literal("openai"),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

const anthropicModelListSchema = z
  .object({
    data: z
      .array(
        z
          .object({
            type: z.literal("model"),
            id: z.string().min(1),
            display_name: z.string().min(1),
            created_at: z.iso.datetime(),
          })
          .strict(),
      )
      .min(1),
    has_more: z.literal(false),
    first_id: z.string().min(1),
    last_id: z.string().min(1),
  })
  .strict();

const UNAUTHENTICATED_REQUESTS = [
  {
    path: "/openai/v1/responses",
    body: { model: "gpt-6-sol", input: "hello" },
    error: {
      error: {
        message: "Invalid gateway credential",
        type: "authentication_error",
        param: null,
        code: "invalid_api_key",
      },
    },
  },
  {
    path: "/anthropic/v1/messages",
    body: {
      model: "claude-opus-5-5",
      max_tokens: 8,
      messages: [{ role: "user", content: "hello" }],
    },
    error: {
      type: "error",
      error: {
        type: "authentication_error",
        message: "Invalid gateway credential",
      },
    },
  },
] as const;

const UNKNOWN_MODEL_REQUESTS = [
  {
    provider: GatewayProvider.OPENAI,
    apiFormat: "openai.responses",
    path: "/openai/v1/responses",
    body: { model: "not-a-gateway-model", input: "hello" },
    error: {
      error: {
        message: "Invalid gateway model",
        type: "invalid_request_error",
        param: null,
        code: "invalid_model",
      },
    },
  },
  {
    provider: GatewayProvider.ANTHROPIC,
    apiFormat: "anthropic.messages",
    path: "/anthropic/v1/messages",
    body: {
      model: "not-a-gateway-model",
      max_tokens: 8,
      messages: [{ role: "user", content: "hello" }],
    },
    error: {
      type: "error",
      error: {
        type: "invalid_request_error",
        message: "Invalid gateway model",
      },
    },
  },
] as const satisfies ReadonlyArray<{
  provider: GatewayProviderName;
  apiFormat: GatewayApiFormat;
  path: string;
  body: Record<string, unknown>;
  error: object;
}>;

// The gateway never accepts a client span, so project spoofing stays a direct
// resolve plus OTLP upload. One format is enough: ingestion ignores the span
// project the same way for every provider.
const SPOOFED_INGEST = {
  provider: GatewayProvider.OPENAI,
  apiFormat: "openai.responses",
  baseUrl: "https://api.openai.com/v1",
} as const;

// Unprefixed provider model ids. A connection slug looks like "OpenAI:gpt-6-sol".
const SLUGLESS_COMPLETIONS = [
  {
    provider: GatewayProvider.OPENAI,
    apiFormat: "openai.responses",
    model: "gpt-6-sol",
    path: "/openai/v1/responses",
    body: {
      model: "gpt-6-sol",
      input: "Reply with the word hello.",
      max_output_tokens: 32,
    },
    headers: {},
  },
  {
    provider: GatewayProvider.OPENAI,
    apiFormat: "openai.chat-completions",
    model: "gpt-6-sol",
    path: "/openai/v1/chat/completions",
    body: {
      model: "gpt-6-sol",
      messages: [{ role: "user", content: "Reply with the word hello." }],
      max_completion_tokens: 32,
    },
    headers: {},
  },
  {
    provider: GatewayProvider.ANTHROPIC,
    apiFormat: "anthropic.messages",
    model: "claude-opus-5-5",
    path: "/anthropic/v1/messages",
    body: {
      model: "claude-opus-5-5",
      max_tokens: 32,
      messages: [{ role: "user", content: "Reply with the word hello." }],
    },
    headers: { "anthropic-version": "2023-06-01" },
  },
] as const satisfies ReadonlyArray<{
  provider: GatewayProviderName;
  apiFormat: GatewayApiFormat;
  model: string;
  path: string;
  body: Record<string, unknown>;
  headers: Record<string, string>;
}>;

type ConnectionSnapshot = {
  id: string;
  status: GatewayConnectionStatus;
  encryptedCredential: string;
  displaySecret: string;
  updatedAt: Date;
};

type GatewayConfigSnapshot = {
  defaultIngestionProjectId: string | null;
  ingestionMode: GatewayIngestionMode;
  updatedAt: Date;
};

type Admin = Awaited<ReturnType<typeof createGatewayAdmin>>;

let admin: Admin;
let defaultProjectId: string;
let gatewayBaseUrl = "";
let stopGateway = async () => {};
let gatewayConfigSnapshot: GatewayConfigSnapshot | null = null;
let gatewayConfigPrepared = false;
let connectionSnapshots: ConnectionSnapshot[] = [];
const createdConnectionIds = new Set<string>();
const connectionIdsByProvider = new Map<GatewayProviderName, string>();
const apiKeyIds = new Set<string>();
const originalAllowlist = [
  ...env.LANGFUSE_AI_GATEWAY_ORGANIZATION_ID_ALLOWLIST,
];

describe("AI gateway live end-to-end", () => {
  beforeAll(async () => {
    assertLocalTestTarget();

    if (!env.LANGFUSE_AI_GATEWAY_SERVICE_KEY) {
      throw new Error(
        "Set LANGFUSE_AI_GATEWAY_SERVICE_KEY in .env and restart the web server before running the gateway E2E suite.",
      );
    }
    if (process.env.CI) {
      const missingProviders = ENABLED_PROVIDERS.filter(
        (provider) => !PROVIDER_CREDENTIALS[provider],
      );
      if (missingProviders.length > 0) {
        throw new Error(
          `Missing CI gateway provider credentials for: ${missingProviders.join(", ")}`,
        );
      }
    }

    const health = await fetch(`${BASE_URL}/api/public/health`);
    if (!health.ok) {
      throw new Error(
        `Langfuse is not healthy at ${BASE_URL}. Start the local web and worker stack before running the gateway E2E suite.`,
      );
    }

    const config = await prisma.gatewayConfig.findUnique({
      where: { organizationId: ORGANIZATION_ID },
    });
    gatewayConfigSnapshot = config
      ? {
          defaultIngestionProjectId: config.defaultIngestionProjectId,
          ingestionMode: config.ingestionMode,
          updatedAt: config.updatedAt,
        }
      : null;
    const projectId =
      PROJECT_ID_OVERRIDE ??
      config?.defaultIngestionProjectId ??
      DEFAULT_PROJECT_ID;
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        orgId: ORGANIZATION_ID,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!project) {
      throw new Error(
        `Set LANGFUSE_AI_GATEWAY_E2E_PROJECT_ID to an active project in organization ${ORGANIZATION_ID}.`,
      );
    }
    defaultProjectId = project.id;
    await prisma.gatewayConfig.upsert({
      where: { organizationId: ORGANIZATION_ID },
      create: {
        organizationId: ORGANIZATION_ID,
        defaultIngestionProjectId: defaultProjectId,
        ingestionMode: GatewayIngestionMode.FULL,
      },
      update: {
        defaultIngestionProjectId: defaultProjectId,
        ingestionMode: GatewayIngestionMode.FULL,
      },
    });
    gatewayConfigPrepared = true;

    const connections = await prisma.gatewayAiConnection.findMany({
      where: { organizationId: ORGANIZATION_ID },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        provider: true,
        status: true,
        encryptedCredential: true,
        displaySecret: true,
        updatedAt: true,
      },
    });
    connectionSnapshots = connections.map(
      ({ id, status, encryptedCredential, displaySecret, updatedAt }) => ({
        id,
        status,
        encryptedCredential,
        displaySecret,
        updatedAt,
      }),
    );

    for (const provider of ENABLED_PROVIDERS) {
      const credential = PROVIDER_CREDENTIALS[provider];
      const existingConnection = connections.find(
        (candidate) => candidate.provider === provider,
      );
      if (credential && existingConnection) {
        await prisma.gatewayAiConnection.update({
          where: { id: existingConnection.id },
          data: {
            encryptedCredential: encrypt(credential),
            displaySecret: getDisplaySecretKey(credential),
            status: GatewayConnectionStatus.ENABLED,
          },
        });
        connectionIdsByProvider.set(provider, existingConnection.id);
        continue;
      }
      if (credential) {
        const connection = await prisma.gatewayAiConnection.create({
          data: {
            organizationId: ORGANIZATION_ID,
            name: `Gateway E2E ${provider}`,
            provider,
            encryptedCredential: encrypt(credential),
            displaySecret: getDisplaySecretKey(credential),
            status: GatewayConnectionStatus.ENABLED,
          },
        });
        createdConnectionIds.add(connection.id);
        connectionIdsByProvider.set(provider, connection.id);
        continue;
      }
      const enabledConnection = connections.find(
        (candidate) =>
          candidate.provider === provider &&
          candidate.status === GatewayConnectionStatus.ENABLED,
      );
      if (enabledConnection) {
        connectionIdsByProvider.set(provider, enabledConnection.id);
      }
    }

    if (
      !env.LANGFUSE_AI_GATEWAY_ORGANIZATION_ID_ALLOWLIST.includes(
        ORGANIZATION_ID,
      )
    ) {
      env.LANGFUSE_AI_GATEWAY_ORGANIZATION_ID_ALLOWLIST.push(ORGANIZATION_ID);
    }
    admin = await createGatewayAdmin();
    const gateway = await startGatewayProcess();
    gatewayBaseUrl = gateway.url;
    stopGateway = gateway.stop;
  }, 60_000);

  afterAll(async () => {
    try {
      await stopGateway();
    } finally {
      try {
        await cleanUpTestArtifacts();
      } finally {
        try {
          await restoreProviderConnections();
        } finally {
          try {
            await restoreGatewayConfig();
          } finally {
            env.LANGFUSE_AI_GATEWAY_ORGANIZATION_ID_ALLOWLIST.splice(
              0,
              env.LANGFUSE_AI_GATEWAY_ORGANIZATION_ID_ALLOWLIST.length,
              ...originalAllowlist,
            );
          }
        }
      }
    }
  }, 50_000);

  describe("model catalog", () => {
    it.each(GATEWAY_MODEL_ROUTES)(
      "GET $path lists $provider models",
      async ({ provider, apiFormat, path: requestPath }) => {
        await withGatewayApiKey(
          { provider, apiFormat },
          async ({ secretKey }) => {
            const response = await fetch(`${gatewayBaseUrl}${requestPath}`, {
              headers: { Authorization: `Bearer ${secretKey}` },
            });
            const body = await readJsonResponse(response, 200, requestPath);
            if (provider === GatewayProvider.OPENAI) {
              openAiModelListSchema.parse(body);
              return;
            }
            const models = anthropicModelListSchema.parse(body);
            expect(models.first_id).toBe(models.data[0]?.id);
            expect(models.last_id).toBe(models.data.at(-1)?.id);
          },
        );
      },
      TEST_TIMEOUT_MS,
    );
  });

  describe("client errors", () => {
    it.each(UNAUTHENTICATED_REQUESTS)(
      "POST $path without a credential is rejected",
      async ({ path: requestPath, body, error }) => {
        const response = await fetch(`${gatewayBaseUrl}${requestPath}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        await expectGatewayError(response, 401, error);
      },
    );

    it.each(UNKNOWN_MODEL_REQUESTS)(
      "POST $path rejects an unknown model",
      async ({ provider, apiFormat, path: requestPath, body, error }) => {
        await withGatewayApiKey(
          { provider, apiFormat },
          async ({ secretKey }) => {
            const response = await fetch(`${gatewayBaseUrl}${requestPath}`, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${secretKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify(body),
            });
            await expectGatewayError(response, 400, error);
          },
        );
      },
      TEST_TIMEOUT_MS,
    );
  });

  describe("slugless completions", () => {
    it.each(SLUGLESS_COMPLETIONS)(
      "$provider / $apiFormat completes slugless $model",
      async ({
        provider,
        apiFormat,
        model,
        path: requestPath,
        body,
        headers,
      }) => {
        await withGatewayApiKey(
          { provider, apiFormat },
          async ({ secretKey, providerConnectionId }) => {
            await withAllModelsAllowed(providerConnectionId, async () => {
              const response = await fetch(`${gatewayBaseUrl}${requestPath}`, {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${secretKey}`,
                  "Content-Type": "application/json",
                  ...headers,
                },
                body: JSON.stringify(body),
              });
              const text = await response.text();
              expect(response.status, text).toBe(200);
              const payload = JSON.parse(text) as {
                model?: string;
                usage?: unknown;
              };
              expectRequestedProviderModel(payload.model, model);
              expect(payload.model).not.toContain(":");
              const expectedUsage = expectedProvidedUsage(
                apiFormat,
                payload.usage,
              );

              const traceId = response.headers.get("langfuse-trace-id");
              const observationId = response.headers.get(
                "langfuse-observation-id",
              );
              expect(traceId).toMatch(/^[0-9a-f]{32}$/);
              expect(observationId).toMatch(/^[0-9a-f]{16}$/);

              await waitForExpect(
                async () => {
                  const observation = await getObservationByIdFromEventsTable({
                    id: observationId!,
                    projectId: defaultProjectId,
                    traceId: traceId!,
                  });
                  if (!observation) {
                    throw new Error(
                      `Observation ${observationId} was not found`,
                    );
                  }
                  expect(observation.projectId).toBe(defaultProjectId);
                  expect(observation.traceId).toBe(traceId);
                  expect(observation.type).toBe("GENERATION");
                  expectRequestedProviderModel(observation.model, model);
                  expect(observation.model).not.toContain(":");
                  expect(observation.providedUsageDetails).toEqual(
                    expectedUsage,
                  );
                  await expectStoredInOneProject({
                    observationId: observationId!,
                    traceId: traceId!,
                  });
                },
                90_000,
                1_000,
              );
            });
          },
        );
      },
      180_000,
    );
  });

  describe("ingestion project binding", () => {
    it(
      "ignores a spoofed project id on a resolved span",
      async () => {
        const { provider, apiFormat, baseUrl } = SPOOFED_INGEST;
        await withGatewayApiKey(
          { provider, apiFormat },
          async ({
            secretKey,
            id: keyId,
            providerConnectionId,
            providerConnectionName,
          }) => {
            const resolved = GatewayResolveResponseSchema.parse(
              await gatewayControlPlaneRequest({
                apiFormat,
                virtualSecretKey: secretKey,
                model: `${providerConnectionName}:ai-gateway-e2e`,
              }),
            );

            expect(resolved.connection.api_format).toBe(apiFormat);
            expect(resolved.connection.base_url).toBe(baseUrl);
            expect(resolved.connection.auth).toMatchObject({
              type: "Bearer",
              token: expect.stringMatching(/\S/),
            });
            expect(resolved.attribution).toEqual({
              organization_id: ORGANIZATION_ID,
              project_id: expect.stringMatching(/\S/),
              key_id: keyId,
              user_id: admin.userId,
              key_name: `Gateway E2E ${provider} ${apiFormat}`,
              user_name: admin.userName || null,
              key_metadata: {
                test: true,
                provider,
                apiFormat,
              },
              provider_connection_id: providerConnectionId,
            });
            expect(resolved.ingestion).toMatchObject({
              access_token: expect.stringMatching(/\S/),
              token_type: "Bearer",
              expires_at: expect.any(Number),
            });

            const ingestionToken = resolved.ingestion!.access_token;
            await ingestTrace(ingestionToken, { provider, apiFormat });
          },
        );
      },
      TEST_TIMEOUT_MS,
    );
  });
});

async function withGatewayApiKey(
  input: {
    provider: GatewayProviderName;
    apiFormat: GatewayApiFormat;
  },
  run: (key: {
    secretKey: string;
    id: string;
    providerConnectionId: string;
    providerConnectionName: string;
  }) => Promise<void>,
) {
  const targetConnectionId = connectionIdsByProvider.get(input.provider);
  if (!targetConnectionId) {
    throw new Error(
      `Add and enable a valid ${input.provider} connection for organization ${ORGANIZATION_ID} before running this test.`,
    );
  }
  await selectOnlyConnection(targetConnectionId);
  const targetConnection = await prisma.gatewayAiConnection.findUniqueOrThrow({
    where: { id: targetConnectionId },
    select: { name: true },
  });

  const gatewayKey = await admin.caller.aiGateway.createApiKey({
    orgId: ORGANIZATION_ID,
    name: `Gateway E2E ${input.provider} ${input.apiFormat}`,
    metadata: {
      test: true,
      provider: input.provider,
      apiFormat: input.apiFormat,
    },
  });
  apiKeyIds.add(gatewayKey.id);

  try {
    const listedKeys = await admin.caller.aiGateway.listApiKeys({
      orgId: ORGANIZATION_ID,
    });
    expect(
      listedKeys.data.some(({ apiKey }) => apiKey.id === gatewayKey.id),
    ).toBe(true);

    await run({
      secretKey: gatewayKey.secretKey,
      id: gatewayKey.id,
      providerConnectionId: targetConnectionId,
      providerConnectionName: targetConnection.name,
    });
  } finally {
    await admin.caller.aiGateway.revokeApiKey({
      orgId: ORGANIZATION_ID,
      id: gatewayKey.id,
    });
    apiKeyIds.delete(gatewayKey.id);
  }
}

async function cleanUpTestArtifacts() {
  if (apiKeyIds.size > 0) {
    await prisma.apiKey.deleteMany({
      where: { id: { in: [...apiKeyIds] } },
    });
  }
}

async function restoreProviderConnections() {
  if (createdConnectionIds.size > 0) {
    await prisma.gatewayAiConnection.deleteMany({
      where: { id: { in: [...createdConnectionIds] } },
    });
  }
  if (connectionSnapshots.length === 0) return;

  await prisma.$transaction(
    connectionSnapshots.map((connection) =>
      prisma.gatewayAiConnection.update({
        where: { id: connection.id },
        data: {
          status: connection.status,
          encryptedCredential: connection.encryptedCredential,
          displaySecret: connection.displaySecret,
          updatedAt: connection.updatedAt,
        },
      }),
    ),
  );
  await clearModelCaches([
    ...connectionSnapshots.map(({ id }) => id),
    ...createdConnectionIds,
  ]);
}

async function restoreGatewayConfig() {
  if (!gatewayConfigPrepared) return;

  if (gatewayConfigSnapshot) {
    await prisma.gatewayConfig.update({
      where: { organizationId: ORGANIZATION_ID },
      data: gatewayConfigSnapshot,
    });
  } else {
    await prisma.gatewayConfig.deleteMany({
      where: { organizationId: ORGANIZATION_ID },
    });
  }
}

async function createGatewayAdmin() {
  const membership = await prisma.organizationMembership.findFirst({
    where: { orgId: ORGANIZATION_ID, role: Role.OWNER },
    select: { userId: true },
  });
  if (!membership) {
    throw new Error(
      `Organization ${ORGANIZATION_ID} needs an owner before running this suite.`,
    );
  }
  const [organization, user] = await Promise.all([
    prisma.organization.findUniqueOrThrow({
      where: { id: ORGANIZATION_ID },
      select: { id: true, name: true },
    }),
    prisma.user.findUniqueOrThrow({
      where: { id: membership.userId },
      select: { id: true, name: true },
    }),
  ]);
  const session: Session = {
    expires: "1",
    user: {
      id: user.id,
      name: user.name,
      canCreateOrganizations: true,
      featureFlags: testFeatureFlags({ templateFlag: false }),
      organizations: [
        {
          id: organization.id,
          name: organization.name,
          role: Role.OWNER,
          cloudConfig: undefined,
          plan: "oss",
          metadata: {},
          aiFeaturesEnabled: false,
          aiTelemetryEnabled: true,
          projects: [],
        },
      ],
    },
    environment: {} as Session["environment"],
  };
  const context = createInnerTRPCContext({ session, headers: {} });
  return {
    caller: appRouter.createCaller({ ...context, prisma }),
    userId: user.id,
    userName: user.name,
  };
}

async function selectOnlyConnection(targetConnectionId: string) {
  await prisma.$transaction([
    prisma.gatewayAiConnection.updateMany({
      where: {
        organizationId: ORGANIZATION_ID,
        id: { not: targetConnectionId },
      },
      data: { status: GatewayConnectionStatus.DISABLED },
    }),
    prisma.gatewayAiConnection.update({
      where: { id: targetConnectionId },
      data: { status: GatewayConnectionStatus.ENABLED },
    }),
  ]);
  await clearModelCaches(connectionSnapshots.map(({ id }) => id));
}

async function clearModelCaches(connectionIds: string[]) {
  if (!redis || connectionIds.length === 0) return;
  await redis.del(
    ...connectionIds.map(
      (connectionId) => `ai-gateway:models:${ORGANIZATION_ID}:${connectionId}`,
    ),
  );
}

async function gatewayControlPlaneRequest(input: {
  apiFormat: GatewayApiFormat;
  virtualSecretKey: string;
  model: string;
}): Promise<unknown> {
  const timestamp = Math.floor(Date.now() / 1000);
  const canonicalMessage = [
    "gateway-web-v1",
    timestamp.toString(),
    sha256Hex(input.virtualSecretKey),
  ].join("\n");
  const gatewayAuthorization = `HMAC timestamp=${timestamp},signature=${signHmacSha256(
    canonicalMessage,
    env.LANGFUSE_AI_GATEWAY_SERVICE_KEY!,
  )}`;

  const response = await fetch(`${BASE_URL}${RESOLVE_PATH}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.virtualSecretKey}`,
      "Content-Type": "application/json",
      "Langfuse-Gateway-Authorization": gatewayAuthorization,
    },
    body: JSON.stringify({ apiFormat: input.apiFormat, model: input.model }),
  });
  return readJsonResponse(response, 200, RESOLVE_PATH);
}

async function expectGatewayError(
  response: Response,
  expectedStatus: number,
  error: object,
) {
  const text = await response.text();
  expect(response.status, text).toBe(expectedStatus);
  expect(JSON.parse(text)).toMatchObject({
    ...error,
    request_id: expect.stringMatching(/\S/),
  });
}

async function expectStoredInOneProject(input: {
  observationId: string;
  traceId: string;
}) {
  const projects = await queryClickhouse<{ project_id: string }>({
    query: `SELECT DISTINCT project_id FROM events_core
      WHERE span_id = {observationId: String} AND trace_id = {traceId: String}`,
    params: input,
  });
  expect(projects.map(({ project_id }) => project_id)).toEqual([
    defaultProjectId,
  ]);
}

async function ingestTrace(
  ingestionToken: string,
  source: { provider: GatewayProviderName; apiFormat: GatewayApiFormat },
) {
  const traceIdBytes = randomBytes(16);
  const observationIdBytes = randomBytes(8);
  const traceId = traceIdBytes.toString("hex");
  const observationId = observationIdBytes.toString("hex");
  const startTimeUnixNano = BigInt(Date.now()) * 1_000_000n;
  // The payload claims another project everywhere a span can; ingestion must still
  // write only into the project named by the gateway token.
  const spoofedProjectId = `spoofed-${randomBytes(8).toString("hex")}`;
  const spoofedProject = {
    key: "langfuse.project.id",
    value: { stringValue: spoofedProjectId },
  };
  const ExportTraceServiceRequest =
    $root.opentelemetry.proto.collector.trace.v1.ExportTraceServiceRequest;
  const requestBody = ExportTraceServiceRequest.encode(
    ExportTraceServiceRequest.fromObject({
      resourceSpans: [
        {
          resource: { attributes: [spoofedProject] },
          scopeSpans: [
            {
              scope: { name: "langfuse-ai-gateway-e2e", version: "1.0.0" },
              spans: [
                {
                  traceId: traceIdBytes,
                  spanId: observationIdBytes,
                  name: `Gateway E2E ${source.provider} ${source.apiFormat}`,
                  kind: 1,
                  startTimeUnixNano: startTimeUnixNano.toString(),
                  endTimeUnixNano: (startTimeUnixNano + 1_000_000n).toString(),
                  attributes: [
                    {
                      key: "langfuse.observation.type",
                      value: { stringValue: "generation" },
                    },
                    {
                      key: "gen_ai.request.model",
                      value: { stringValue: "ai-gateway-e2e" },
                    },
                    spoofedProject,
                    {
                      key: "langfuse.observation.metadata",
                      value: {
                        stringValue: JSON.stringify({
                          "langfuse.gateway.project.id": spoofedProjectId,
                        }),
                      },
                    },
                  ],
                  status: { code: 1 },
                },
              ],
            },
          ],
        },
      ],
    }),
  ).finish();
  const response = await fetch(`${BASE_URL}/api/public/otel/v1/traces`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ingestionToken}`,
      "Langfuse-Gateway-Authorization":
        gatewayIngestionAuthorization(ingestionToken),
      "Content-Type": "application/x-protobuf",
      "x-langfuse-ingestion-version": "4",
      "x-langfuse-sdk-name": "ai-gateway-e2e",
      "x-langfuse-sdk-version": "1.0.0",
    },
    body: requestBody,
  });
  await expectResponseStatus(response, 200, "/api/public/otel/v1/traces");

  await waitForExpect(
    async () => {
      const [trace, observation] = await Promise.all([
        getTraceByIdFromEventsTable({
          traceId,
          projectId: defaultProjectId,
        }),
        getObservationByIdFromEventsTable({
          id: observationId,
          projectId: defaultProjectId,
        }),
      ]);
      expect(trace?.id).toBe(traceId);
      expect(observation?.id).toBe(observationId);
      await expectStoredInOneProject({ observationId, traceId });
    },
    40_000,
    1_000,
  );

  return { traceId, observationId };
}

function gatewayIngestionAuthorization(token: string) {
  const timestamp = Math.floor(Date.now() / 1000);
  const canonicalMessage = [
    "gateway-web-v1",
    timestamp.toString(),
    sha256Hex(token),
  ].join("\n");
  return `HMAC timestamp=${timestamp},signature=${signHmacSha256(
    canonicalMessage,
    env.LANGFUSE_AI_GATEWAY_SERVICE_KEY!,
  )}`;
}

async function readJsonResponse<T = unknown>(
  response: Response,
  expectedStatus: number,
  label: string,
): Promise<T> {
  const text = await response.text();
  if (response.status !== expectedStatus) {
    throw new Error(
      `${label} returned ${response.status}; expected ${expectedStatus}. Response: ${text}`,
    );
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`${label} returned invalid JSON`);
  }
}

async function expectResponseStatus(
  response: Response,
  expectedStatus: number,
  label: string,
) {
  if (response.status === expectedStatus) return;
  throw new Error(
    `${label} returned ${response.status}; expected ${expectedStatus}. Response: ${await response.text()}`,
  );
}

function sha256Hex(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function expectRequestedProviderModel(actual: unknown, requested: string) {
  const value = typeof actual === "string" ? actual : "";
  const matches =
    value === requested ||
    value.startsWith(`${requested}-`) ||
    value.startsWith(`${requested}.`);
  expect(
    matches,
    `expected ${JSON.stringify(actual)} to equal ${requested} or a dated snapshot of it`,
  ).toBe(true);
}

function expectedProvidedUsage(
  apiFormat: GatewayApiFormat,
  usage: unknown,
): Record<string, number> {
  const projected = projectGatewayUsage(apiFormat, usage);
  const parsed = projected ? UsageDetails.safeParse(projected) : null;
  if (!parsed?.success || !parsed.data) {
    throw new Error(
      `Provider usage for ${apiFormat} did not convert: ${JSON.stringify(usage)}`,
    );
  }
  if (!Object.values(parsed.data).some((value) => value > 0)) {
    throw new Error(
      `Provider usage for ${apiFormat} has no positive counters: ${JSON.stringify(usage)}`,
    );
  }
  return parsed.data;
}

function projectGatewayUsage(apiFormat: GatewayApiFormat, usage: unknown) {
  if (!usage || typeof usage !== "object" || Array.isArray(usage)) return null;
  const record = usage as Record<string, unknown>;
  if (apiFormat === "anthropic.messages") return record;
  if (apiFormat === "openai.responses") {
    return projectOpenAiUsage(
      record,
      ["input_tokens", "output_tokens", "total_tokens"],
      ["input_tokens_details", "output_tokens_details"],
    );
  }
  return projectOpenAiUsage(
    record,
    ["prompt_tokens", "completion_tokens", "total_tokens"],
    ["prompt_tokens_details", "completion_tokens_details"],
  );
}

function projectOpenAiUsage(
  usage: Record<string, unknown>,
  counters: readonly [string, string, string],
  details: readonly [string, string],
) {
  const projected: Record<string, unknown> = {};
  for (const key of counters) {
    const value = usage[key];
    if (!isCountedToken(value)) return null;
    projected[key] = value;
  }
  for (const key of details) {
    const value = usage[key];
    if (value === null) {
      projected[key] = null;
      continue;
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const kept: Record<string, number | null> = {};
    for (const [detailKey, detailValue] of Object.entries(value)) {
      if (detailValue === null || isCountedToken(detailValue)) {
        kept[detailKey] = detailValue;
      }
    }
    projected[key] = kept;
  }
  return projected;
}

function isCountedToken(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

async function withAllModelsAllowed(
  connectionId: string,
  run: () => Promise<void>,
) {
  const existing = await prisma.gatewayAiConnection.findUniqueOrThrow({
    where: { id: connectionId },
    select: { allowedModels: true, updatedAt: true },
  });
  const previous = Array.isArray(existing.allowedModels)
    ? existing.allowedModels.filter(
        (model): model is string => typeof model === "string",
      )
    : null;
  const opened = await admin.caller.aiGateway.updateConnectionModels({
    orgId: ORGANIZATION_ID,
    id: connectionId,
    allowedModels: null,
    expectedUpdatedAt: existing.updatedAt,
  });
  try {
    await run();
  } finally {
    await admin.caller.aiGateway.updateConnectionModels({
      orgId: ORGANIZATION_ID,
      id: connectionId,
      allowedModels: previous,
      expectedUpdatedAt: opened.updatedAt,
    });
  }
}

function resolveGatewayBinary() {
  const override = process.env.LANGFUSE_AI_GATEWAY_BIN;
  if (override) {
    if (!existsSync(override)) {
      throw new Error(`LANGFUSE_AI_GATEWAY_BIN does not exist: ${override}`);
    }
    return override;
  }
  const root = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../..",
  );
  const binaryName =
    process.platform === "win32" ? "ai-gateway.exe" : "ai-gateway";
  for (const profile of ["release", "debug"]) {
    const candidate = path.join(
      root,
      "ai-gateway",
      "target",
      profile,
      binaryName,
    );
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(
    "Build the AI gateway before this suite (`pnpm --filter ai-gateway build`) or set LANGFUSE_AI_GATEWAY_BIN.",
  );
}

function reserveLoopbackPort() {
  return new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Could not reserve a gateway port"));
        return;
      }
      const { port } = address;
      server.close((error) => {
        if (error) reject(error);
        else resolve(port);
      });
    });
  });
}

async function startGatewayProcess() {
  if (!env.LANGFUSE_AI_GATEWAY_SERVICE_KEY) {
    throw new Error(
      "Set LANGFUSE_AI_GATEWAY_SERVICE_KEY before starting the gateway process.",
    );
  }
  const binary = resolveGatewayBinary();
  const port = await reserveLoopbackPort();
  const logs: string[] = [];
  const appendLog = (chunk: string) => {
    logs.push(chunk);
    const joined = logs.join("");
    if (joined.length > 16_000) {
      logs.splice(0, logs.length, joined.slice(-12_000));
    }
  };
  const child = spawn(binary, [], {
    env: {
      ...process.env,
      LANGFUSE_AI_GATEWAY_WEB_URL: BASE_URL,
      LANGFUSE_AI_GATEWAY_SERVICE_KEY: env.LANGFUSE_AI_GATEWAY_SERVICE_KEY,
      LANGFUSE_AI_GATEWAY_LISTEN_ADDRESS: `127.0.0.1:${port}`,
      LANGFUSE_AI_GATEWAY_AUTO_INCREMENT_LISTEN_PORT: "false",
      LANGFUSE_AI_GATEWAY_CONNECTION_DRAIN_TIMEOUT_SECONDS: "5",
      LANGFUSE_LOG_FORMAT: "json",
      LANGFUSE_LOG_LEVEL: "info",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout?.setEncoding("utf8");
  child.stderr?.setEncoding("utf8");
  child.stdout?.on("data", appendLog);
  child.stderr?.on("data", appendLog);
  const url = `http://127.0.0.1:${port}`;
  let startupError: Error | undefined;
  child.once("error", (error) => {
    startupError = error;
  });
  try {
    await waitForGatewayReady(child, url, logs, () => startupError);
  } catch (error) {
    await stopGatewayProcess(child);
    throw error;
  }
  return {
    url,
    stop: () => stopGatewayProcess(child),
  };
}

async function waitForGatewayReady(
  child: ChildProcess,
  url: string,
  logs: string[],
  startupError: () => Error | undefined,
) {
  const deadline = Date.now() + 20_000;
  let lastError = "gateway did not become ready";
  while (Date.now() < deadline) {
    const error = startupError();
    if (error) {
      throw new Error(
        `AI gateway failed to start: ${error.message}\n${logs.join("")}`,
      );
    }
    if (child.exitCode != null || child.signalCode != null) {
      throw new Error(
        `AI gateway exited ${child.exitCode ?? child.signalCode} before ready.\n${logs.join("")}`,
      );
    }
    try {
      const response = await fetch(`${url}/ready`, {
        signal: AbortSignal.timeout(500),
      });
      if (response.ok) return;
      lastError = `ready returned ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : "connection failed";
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`${lastError}\n${logs.join("")}`);
}

function stopGatewayProcess(child: ChildProcess) {
  if (child.exitCode != null || child.signalCode != null) {
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
    }, 15_000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
    child.kill("SIGTERM");
  });
}

function assertLocalTestTarget() {
  const allowedHosts = new Set([
    "localhost",
    "127.0.0.1",
    "::1",
    "postgres",
    "host.docker.internal",
  ]);
  const apiHost = new URL(BASE_URL).hostname;
  const databaseHost = new URL(env.DATABASE_URL).hostname;
  if (!allowedHosts.has(apiHost) || !allowedHosts.has(databaseHost)) {
    throw new Error(
      "Gateway E2E changes provider connection state and may only run against a local API and database.",
    );
  }
}
