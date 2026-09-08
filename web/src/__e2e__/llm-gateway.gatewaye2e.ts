import { createHash, randomBytes, randomUUID } from "node:crypto";

import type { Session } from "next-auth";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import waitForExpect from "wait-for-expect";

import { env } from "@/src/env.mjs";
import { GetMediaUploadUrlResponseSchema } from "@/src/features/media/validation";
import { $root } from "@/src/pages/api/public/otel/otlp-proto/generated/root";
import {
  type GatewayApiFormat,
  GatewayModelsResponseSchema,
  GatewayResolveResponseSchema,
} from "@/src/features/llm-gateway/server/provider";
import type { GatewayProviderName } from "@/src/features/llm-gateway/server/provider/registry";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import { signHmacSha256 } from "@/src/server/utils/hmac";
import { encrypt } from "@langfuse/shared/encryption";
import {
  GatewayConnectionStatus,
  GatewayInstrumentationMode,
  GatewayProvider,
  prisma,
  Role,
} from "@langfuse/shared/src/db";
import {
  getObservationByIdFromEventsTable,
  getTraceByIdFromEventsTable,
  redis,
} from "@langfuse/shared/src/server";
import { getDisplaySecretKey } from "@langfuse/shared/src/server/auth/apiKeys";

const BASE_URL = (
  process.env.LANGFUSE_GATEWAY_E2E_BASE_URL ?? "http://localhost:3000"
).replace(/\/$/, "");
const ORGANIZATION_ID =
  process.env.LANGFUSE_GATEWAY_E2E_ORGANIZATION_ID ?? "seed-org-id";
const PROJECT_ID_OVERRIDE = process.env.LANGFUSE_GATEWAY_E2E_PROJECT_ID;
const DEFAULT_PROJECT_ID = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";
const MODELS_PATH = "/api/internal/ai-gateway/v1/models";
const RESOLVE_PATH = "/api/internal/ai-gateway/v1/resolve";
const TEST_TIMEOUT_MS = 120_000;
const PROVIDER_CREDENTIALS: Partial<Record<GatewayProviderName, string>> = {
  OPENAI: process.env.LANGFUSE_LLM_CONNECTION_OPENAI_KEY,
  ANTHROPIC: process.env.LANGFUSE_LLM_CONNECTION_ANTHROPIC_KEY,
  OPENROUTER: process.env.LANGFUSE_LLM_CONNECTION_OPENROUTER_KEY,
};

const PROVIDER_FORMATS = [
  {
    provider: GatewayProvider.OPENAI,
    apiFormat: "openai.responses",
    baseUrl: "https://api.openai.com/v1",
    authType: "Bearer",
  },
  {
    provider: GatewayProvider.OPENAI,
    apiFormat: "openai.chat-completions",
    baseUrl: "https://api.openai.com/v1",
    authType: "Bearer",
  },
  {
    provider: GatewayProvider.OPENROUTER,
    apiFormat: "openai.responses",
    baseUrl: "https://openrouter.ai/api/v1",
    authType: "Bearer",
  },
  {
    provider: GatewayProvider.OPENROUTER,
    apiFormat: "openai.chat-completions",
    baseUrl: "https://openrouter.ai/api/v1",
    authType: "Bearer",
  },
  {
    provider: GatewayProvider.ANTHROPIC,
    apiFormat: "anthropic.messages",
    baseUrl: "https://api.anthropic.com/v1",
    authType: "x-api-key",
  },
] as const satisfies ReadonlyArray<{
  provider: GatewayProviderName;
  apiFormat: GatewayApiFormat;
  baseUrl: string;
  authType: "Bearer" | "x-api-key";
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
  instrumentationMode: GatewayInstrumentationMode;
  updatedAt: Date;
};

type Admin = Awaited<ReturnType<typeof createGatewayAdmin>>;

let admin: Admin;
let defaultProjectId: string;
let gatewayConfigSnapshot: GatewayConfigSnapshot | null = null;
let gatewayConfigPrepared = false;
let connectionSnapshots: ConnectionSnapshot[] = [];
const createdConnectionIds = new Set<string>();
const connectionIdsByProvider = new Map<GatewayProviderName, string>();
const apiKeyIds = new Set<string>();
const mediaIds = new Set<string>();
const originalAllowlist = [...env.LANGFUSE_GATEWAY_ORGANIZATION_ID_ALLOWLIST];

describe("LLM gateway live end-to-end", () => {
  beforeAll(async () => {
    assertLocalTestTarget();

    if (!env.LANGFUSE_GATEWAY_SERVICE_KEY) {
      throw new Error(
        "Set LANGFUSE_GATEWAY_SERVICE_KEY in .env and restart the web server before running the gateway E2E suite.",
      );
    }
    if (process.env.CI) {
      const missingProviders = Object.values(GatewayProvider).filter(
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
          instrumentationMode: config.instrumentationMode,
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
        `Set LANGFUSE_GATEWAY_E2E_PROJECT_ID to an active project in organization ${ORGANIZATION_ID}.`,
      );
    }
    defaultProjectId = project.id;
    await prisma.gatewayConfig.upsert({
      where: { organizationId: ORGANIZATION_ID },
      create: {
        organizationId: ORGANIZATION_ID,
        defaultIngestionProjectId: defaultProjectId,
        instrumentationMode: GatewayInstrumentationMode.FULL,
      },
      update: {
        defaultIngestionProjectId: defaultProjectId,
        instrumentationMode: GatewayInstrumentationMode.FULL,
      },
    });
    gatewayConfigPrepared = true;

    const connections = await prisma.gatewayAiConnection.findMany({
      where: { organizationId: ORGANIZATION_ID },
      orderBy: { routingPriority: "asc" },
      select: {
        id: true,
        provider: true,
        status: true,
        encryptedCredential: true,
        displaySecret: true,
        routingPriority: true,
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

    let nextRoutingPriority =
      Math.max(
        -1,
        ...connections.map(({ routingPriority }) => routingPriority),
      ) + 1;
    for (const provider of Object.values(GatewayProvider)) {
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
            routingPriority: nextRoutingPriority,
            status: GatewayConnectionStatus.ENABLED,
          },
        });
        nextRoutingPriority += 1;
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
      !env.LANGFUSE_GATEWAY_ORGANIZATION_ID_ALLOWLIST.includes(ORGANIZATION_ID)
    ) {
      env.LANGFUSE_GATEWAY_ORGANIZATION_ID_ALLOWLIST.push(ORGANIZATION_ID);
    }
    admin = await createGatewayAdmin();
  }, 30_000);

  afterAll(async () => {
    try {
      await cleanUpTestArtifacts();
    } finally {
      try {
        await restoreProviderConnections();
      } finally {
        try {
          await restoreGatewayConfig();
        } finally {
          env.LANGFUSE_GATEWAY_ORGANIZATION_ID_ALLOWLIST.splice(
            0,
            env.LANGFUSE_GATEWAY_ORGANIZATION_ID_ALLOWLIST.length,
            ...originalAllowlist,
          );
        }
      }
    }
  }, 30_000);

  describe("model discovery", () => {
    it.each(PROVIDER_FORMATS)(
      "$provider / $apiFormat returns the provider-native model format",
      async ({ provider, apiFormat }) => {
        await withGatewayApiKey(
          { provider, apiFormat },
          async ({ secretKey }) => {
            const modelsBody = await gatewayControlPlaneRequest({
              path: MODELS_PATH,
              apiFormat,
              virtualSecretKey: secretKey,
            });
            const models = GatewayModelsResponseSchema.parse(modelsBody);
            expect(models.data.length).toBeGreaterThan(0);

            if (apiFormat === "anthropic.messages") {
              expect("object" in models).toBe(false);
              if ("object" in models) {
                throw new Error("Anthropic returned an OpenAI models response");
              }
              expect(models.first_id).toBe(models.data[0]?.id);
              expect(models.last_id).toBe(models.data.at(-1)?.id);
              expect(models.data).toEqual(
                expect.arrayContaining([
                  expect.objectContaining({
                    type: "model",
                    id: expect.any(String),
                    display_name: expect.any(String),
                    created_at: expect.stringMatching(
                      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
                    ),
                  }),
                ]),
              );
              for (const model of models.data) {
                expect(model).toHaveProperty("capabilities");
                expect(model).toHaveProperty("max_input_tokens");
                expect(model).toHaveProperty("max_tokens");
                expect(
                  model.capabilities === null ||
                    (typeof model.capabilities === "object" &&
                      !Array.isArray(model.capabilities)),
                ).toBe(true);
                expect(
                  model.max_input_tokens === null ||
                    typeof model.max_input_tokens === "number",
                ).toBe(true);
                expect(
                  model.max_tokens === null ||
                    typeof model.max_tokens === "number",
                ).toBe(true);
              }
            } else {
              expect("object" in models).toBe(true);
              if (!("object" in models)) {
                throw new Error(
                  "OpenAI-compatible provider returned an Anthropic models response",
                );
              }
              expect(models.object).toBe("list");
              expect(models.data).toEqual(
                expect.arrayContaining([
                  expect.objectContaining({
                    object: "model",
                    id: expect.any(String),
                    created: expect.any(Number),
                    owned_by: expect.any(String),
                  }),
                ]),
              );
              for (const model of models.data) {
                expect(model).not.toHaveProperty("capabilities");
                expect(model).not.toHaveProperty("max_input_tokens");
                expect(model).not.toHaveProperty("max_tokens");
              }
            }
          },
        );
      },
      TEST_TIMEOUT_MS,
    );
  });

  describe("gateway roundtrip", () => {
    it.each(PROVIDER_FORMATS)(
      "$provider / $apiFormat resolves credentials and ingests telemetry",
      async ({ provider, apiFormat, baseUrl, authType }) => {
        await withGatewayApiKey(
          { provider, apiFormat },
          async ({ secretKey, id: keyId }) => {
            const resolveBody = await gatewayControlPlaneRequest({
              path: RESOLVE_PATH,
              apiFormat,
              virtualSecretKey: secretKey,
            });
            const resolved = GatewayResolveResponseSchema.parse(resolveBody);

            expect(resolved.connection.api_format).toBe(apiFormat);
            expect(resolved.connection.base_url).toBe(baseUrl);
            if (authType === "x-api-key") {
              expect(resolved.connection.auth).toMatchObject({
                type: "x-api-key",
                header: "x-api-key",
                value: expect.stringMatching(/\S/),
              });
            } else {
              expect(resolved.connection.auth).toMatchObject({
                type: "Bearer",
                token: expect.stringMatching(/\S/),
              });
            }
            expect(resolved.attribution).toEqual({
              test: true,
              provider,
              apiFormat,
              organization_id: ORGANIZATION_ID,
              project_id: expect.stringMatching(/\S/),
              key_id: keyId,
            });
            expect(resolved.ingestion).toMatchObject({
              access_token: expect.stringMatching(/\S/),
              token_type: "Bearer",
              expires_in: expect.any(Number),
            });

            const ingestionToken = resolved.ingestion?.access_token;
            if (!ingestionToken)
              throw new Error("Resolve did not return an ingestion token");

            const { traceId, observationId } = await ingestTrace(
              ingestionToken,
              {
                provider,
                apiFormat,
              },
            );
            await uploadMedia(ingestionToken, { traceId, observationId });
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
  run: (key: { secretKey: string; id: string }) => Promise<void>,
) {
  const targetConnectionId = connectionIdsByProvider.get(input.provider);
  if (!targetConnectionId) {
    throw new Error(
      `Add and enable a valid ${input.provider} connection for organization ${ORGANIZATION_ID} before running this test.`,
    );
  }
  await selectOnlyConnection(targetConnectionId);

  const gatewayKey = await admin.caller.llmGateway.createApiKey({
    orgId: ORGANIZATION_ID,
    note: `Gateway E2E ${input.provider} ${input.apiFormat}`,
    metadata: {
      test: true,
      provider: input.provider,
      apiFormat: input.apiFormat,
    },
  });
  apiKeyIds.add(gatewayKey.id);

  try {
    const listedKeys = await admin.caller.llmGateway.listApiKeys({
      orgId: ORGANIZATION_ID,
    });
    expect(
      listedKeys.data.some(({ apiKey }) => apiKey.id === gatewayKey.id),
    ).toBe(true);

    await run({ secretKey: gatewayKey.secretKey, id: gatewayKey.id });
  } finally {
    await admin.caller.llmGateway.revokeApiKey({
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
  if (mediaIds.size === 0 || !defaultProjectId) return;

  await prisma.traceMedia.deleteMany({
    where: { projectId: defaultProjectId, mediaId: { in: [...mediaIds] } },
  });
  await prisma.observationMedia.deleteMany({
    where: { projectId: defaultProjectId, mediaId: { in: [...mediaIds] } },
  });
  await prisma.media.deleteMany({
    where: { projectId: defaultProjectId, id: { in: [...mediaIds] } },
  });
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
      featureFlags: {} as NonNullable<Session["user"]>["featureFlags"],
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
  return { caller: appRouter.createCaller({ ...context, prisma }) };
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
      (connectionId) => `llm-gateway:models:${ORGANIZATION_ID}:${connectionId}`,
    ),
  );
}

async function gatewayControlPlaneRequest(input: {
  path: string;
  apiFormat: GatewayApiFormat;
  virtualSecretKey: string;
}): Promise<unknown> {
  const requestBody = JSON.stringify({ api_format: input.apiFormat });
  const timestamp = Math.floor(Date.now() / 1000);
  const canonicalMessage = [
    "gateway-web-v1",
    timestamp.toString(),
    sha256Hex(input.virtualSecretKey),
  ].join("\n");
  const gatewayAuthorization = `HMAC timestamp=${timestamp},signature=${signHmacSha256(
    canonicalMessage,
    env.LANGFUSE_GATEWAY_SERVICE_KEY!,
  )}`;

  const response = await fetch(`${BASE_URL}${input.path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.virtualSecretKey}`,
      "Content-Type": "application/json",
      "Langfuse-Gateway-Authorization": gatewayAuthorization,
    },
    body: requestBody,
  });
  return readJsonResponse(response, 200, input.path);
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
  const ExportTraceServiceRequest =
    $root.opentelemetry.proto.collector.trace.v1.ExportTraceServiceRequest;
  const requestBody = ExportTraceServiceRequest.encode(
    ExportTraceServiceRequest.fromObject({
      resourceSpans: [
        {
          scopeSpans: [
            {
              scope: { name: "langfuse-gateway-e2e", version: "1.0.0" },
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
                      value: { stringValue: "gateway-e2e" },
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
      "Content-Type": "application/x-protobuf",
      "x-langfuse-ingestion-version": "4",
      "x-langfuse-sdk-name": "gateway-e2e",
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
    },
    40_000,
    1_000,
  );

  return { traceId, observationId };
}

async function uploadMedia(
  ingestionToken: string,
  context: { traceId: string; observationId: string },
) {
  const fileBytes = Buffer.from(`Gateway E2E media ${randomUUID()}`, "utf8");
  const sha256Hash = createHash("sha256").update(fileBytes).digest("base64");
  const createResponse = await fetch(`${BASE_URL}/api/public/media`, {
    method: "POST",
    headers: bearerJsonHeaders(ingestionToken),
    body: JSON.stringify({
      contentType: "text/plain",
      contentLength: fileBytes.length,
      sha256Hash,
      traceId: context.traceId,
      observationId: context.observationId,
      field: "input",
    }),
  });
  const upload = GetMediaUploadUrlResponseSchema.parse(
    await readJsonResponse(createResponse, 201, "/api/public/media"),
  );
  mediaIds.add(upload.mediaId);
  if (!upload.uploadUrl) {
    throw new Error(
      "Media API did not return an upload URL for unique content",
    );
  }

  const uploadResponse = await fetch(upload.uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": "text/plain",
      "X-Amz-Checksum-Sha256": sha256Hash,
    },
    body: fileBytes as BodyInit,
  });
  await expectResponseStatus(uploadResponse, 200, "media upload URL");

  const patchResponse = await fetch(
    `${BASE_URL}/api/public/media/${upload.mediaId}`,
    {
      method: "PATCH",
      headers: bearerJsonHeaders(ingestionToken),
      body: JSON.stringify({
        uploadedAt: new Date().toISOString(),
        uploadHttpStatus: uploadResponse.status,
        uploadHttpError: "",
      }),
    },
  );
  await expectResponseStatus(
    patchResponse,
    200,
    `/api/public/media/${upload.mediaId}`,
  );

  await waitForExpect(
    async () => {
      const [media, observationMedia] = await Promise.all([
        prisma.media.findUnique({
          where: {
            projectId_id: { projectId: defaultProjectId, id: upload.mediaId },
          },
        }),
        prisma.observationMedia.findUnique({
          where: {
            projectId_traceId_observationId_mediaId_field: {
              projectId: defaultProjectId,
              traceId: context.traceId,
              observationId: context.observationId,
              mediaId: upload.mediaId,
              field: "input",
            },
          },
        }),
      ]);
      expect(media).toMatchObject({
        sha256Hash,
        contentType: "text/plain",
        contentLength: BigInt(fileBytes.length),
        uploadHttpStatus: 200,
      });
      expect(observationMedia).not.toBeNull();
    },
    10_000,
    500,
  );
}

function bearerJsonHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
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
