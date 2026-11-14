import { testFeatureFlags } from "@/src/__tests__/fixtures/feature-flags";
import { type ChildProcess, spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { Session } from "next-auth";
import { afterAll, beforeAll, expect } from "vitest";
import waitForExpect from "wait-for-expect";
import { z } from "zod/v4";

import { env } from "@/src/env.mjs";
import { $root } from "@/src/pages/api/public/otel/otlp-proto/generated/root";
import type {
  GatewayApiFormat,
  GatewayProviderName,
} from "@/src/features/ai-gateway/server/provider/registry";
import { GatewayModelCatalogService } from "@/src/features/ai-gateway/server/provider/models/gatewayModelCatalogService";

import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import { signHmacSha256 } from "@/src/server/utils/hmac";
import {
  GatewayConnectionStatus,
  GatewayIngestionMode,
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

const BASE_URL = (
  process.env.LANGFUSE_AI_GATEWAY_E2E_BASE_URL ?? "http://localhost:3000"
).replace(/\/$/, "");
export const ORGANIZATION_ID =
  process.env.LANGFUSE_AI_GATEWAY_E2E_ORGANIZATION_ID ?? "seed-org-id";
const PROJECT_ID_OVERRIDE = process.env.LANGFUSE_AI_GATEWAY_E2E_PROJECT_ID;
const DEFAULT_PROJECT_ID = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";
const RESOLVE_PATH = "/api/internal/ai-gateway/v1/resolve";
export const TEST_TIMEOUT_MS = 120_000;
export const COMPLETION_TIMEOUT_MS = 180_000;

// Chat completions has no separate models route; the OpenAI route lists the
// responses catalog.
const OPENAI_MODELS_PATH = "/openai/v1/models";
const ANTHROPIC_MODELS_PATH = "/anthropic/v1/models";

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

type Admin = Awaited<ReturnType<typeof createGatewayAdmin>>;
type CreateConnectionInput = Parameters<
  Admin["caller"]["aiGateway"]["createConnection"]
>[0];

type ConnectionSpec = Omit<CreateConnectionInput, "orgId" | "name"> & {
  /** Provider model ids the suite calls. Connections whose key may not list models get them as custom models. */
  models: string[];
};

type CompletionRequest = {
  secretKey: string;
  apiFormat: GatewayApiFormat;
  path: string;
  body: Record<string, unknown>;
  headers?: Record<string, string>;
  /** The model the request addresses on the connection. */
  providerModel: string;
  /**
   * The model the provider reports, when it names it differently from
   * `providerModel`; a dated snapshot of it also matches.
   */
  responseModel?: string;
};

type GatewayE2eSuite = {
  admin: Admin;
  gatewayBaseUrl: string;
  projectId: string;
  connection: { id: string; name: string; provider: GatewayProviderName };
};

type ConnectionSnapshot = {
  id: string;
  status: GatewayConnectionStatus;
  updatedAt: Date;
};

type GatewayConfigSnapshot = {
  defaultIngestionProjectId: string | null;
  ingestionMode: GatewayIngestionMode;
  updatedAt: Date;
};

const suite = {} as GatewayE2eSuite;
let stopGateway = async () => {};
let gatewayConfigSnapshot: GatewayConfigSnapshot | null = null;
let gatewayConfigPrepared = false;
let connectionSnapshots: ConnectionSnapshot[] = [];
let createdConnectionId: string | null = null;
const apiKeyIds = new Set<string>();
const originalAllowlist = [
  ...env.LANGFUSE_AI_GATEWAY_ORGANIZATION_ID_ALLOWLIST,
];

/**
 * Starts a local gateway against the running Langfuse stack and adds the
 * provider connection under test as the organization's only enabled
 * connection. Everything is restored after the suite.
 */
export function setUpGatewayE2e(
  connectionSpec: () => ConnectionSpec,
): GatewayE2eSuite {
  beforeAll(async () => {
    assertLocalTestTarget();

    if (!env.LANGFUSE_AI_GATEWAY_SERVICE_KEY) {
      throw new Error(
        "Set LANGFUSE_AI_GATEWAY_SERVICE_KEY in .env and restart the web server before running the gateway E2E suite.",
      );
    }
    const spec = connectionSpec();

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
    suite.projectId = project.id;
    await prisma.gatewayConfig.upsert({
      where: { organizationId: ORGANIZATION_ID },
      create: {
        organizationId: ORGANIZATION_ID,
        defaultIngestionProjectId: suite.projectId,
        ingestionMode: GatewayIngestionMode.FULL,
      },
      update: {
        defaultIngestionProjectId: suite.projectId,
        ingestionMode: GatewayIngestionMode.FULL,
      },
    });
    gatewayConfigPrepared = true;

    connectionSnapshots = await prisma.gatewayAiConnection.findMany({
      where: { organizationId: ORGANIZATION_ID },
      select: { id: true, status: true, updatedAt: true },
    });

    if (
      !env.LANGFUSE_AI_GATEWAY_ORGANIZATION_ID_ALLOWLIST.includes(
        ORGANIZATION_ID,
      )
    ) {
      env.LANGFUSE_AI_GATEWAY_ORGANIZATION_ID_ALLOWLIST.push(ORGANIZATION_ID);
    }
    suite.admin = await createGatewayAdmin();
    suite.connection = await addProviderConnection(spec);
    const gateway = await startGatewayProcess();
    suite.gatewayBaseUrl = gateway.url;
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

  return suite;
}

/** Outside CI, a provider suite without its credentials is skipped rather than failed. */
export function missingLocalEnv(...names: string[]) {
  return !process.env.CI && names.some((name) => !process.env[name]);
}

export function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Set ${name} to run this provider's gateway E2E suite.`);
  }
  return value;
}

export async function withGatewayApiKey(
  apiFormat: GatewayApiFormat,
  run: (key: { secretKey: string; id: string }) => Promise<void>,
) {
  const { provider } = suite.connection;
  const gatewayKey = await suite.admin.caller.aiGateway.createApiKey({
    orgId: ORGANIZATION_ID,
    name: `Gateway E2E ${provider} ${apiFormat}`,
    metadata: {
      test: true,
      provider,
      apiFormat,
    },
  });
  apiKeyIds.add(gatewayKey.id);

  try {
    const listedKeys = await suite.admin.caller.aiGateway.listApiKeys({
      orgId: ORGANIZATION_ID,
    });
    expect(
      listedKeys.data.some(({ apiKey }) => apiKey.id === gatewayKey.id),
    ).toBe(true);

    await run({ secretKey: gatewayKey.secretKey, id: gatewayKey.id });
  } finally {
    await suite.admin.caller.aiGateway.revokeApiKey({
      orgId: ORGANIZATION_ID,
      id: gatewayKey.id,
    });
    apiKeyIds.delete(gatewayKey.id);
  }
}

/** Lists the gateway catalog of the route serving `apiFormat`. */
export async function listGatewayModelIds(
  secretKey: string,
  apiFormat: GatewayApiFormat,
) {
  const requestPath =
    apiFormat === "anthropic.messages"
      ? ANTHROPIC_MODELS_PATH
      : OPENAI_MODELS_PATH;
  const response = await fetch(`${suite.gatewayBaseUrl}${requestPath}`, {
    headers: { Authorization: `Bearer ${secretKey}` },
  });
  const body = await readJsonResponse(response, 200, requestPath);
  if (requestPath === OPENAI_MODELS_PATH) {
    return openAiModelListSchema.parse(body).data.map(({ id }) => id);
  }
  const models = anthropicModelListSchema.parse(body);
  expect(models.first_id).toBe(models.data[0]?.id);
  expect(models.last_id).toBe(models.data.at(-1)?.id);
  return models.data.map(({ id }) => id);
}

/** The gateway slug of a provider model on the connection under test. */
export function gatewayModelSlug(providerModel: string) {
  return `${suite.connection.name}:${providerModel}`;
}

/** A Chat Completions call of `providerModel` addressed by its gateway slug. */
export function chatCompletionRequest(providerModel: string) {
  return {
    apiFormat: "openai.chat-completions",
    path: "/openai/v1/chat/completions",
    body: {
      model: gatewayModelSlug(providerModel),
      messages: [{ role: "user", content: "Reply with the word hello." }],
    },
    providerModel,
  } as const;
}

/** Checks the gateway lists `providerModel`, then completes it as `completeAndExpectIngested` does. */
export async function expectListedAndIngested(
  input: Omit<CompletionRequest, "secretKey">,
) {
  await withGatewayApiKey(input.apiFormat, async ({ secretKey }) => {
    const listed = await listGatewayModelIds(secretKey, input.apiFormat);
    expect(listed, listed.join("\n")).toContain(
      gatewayModelSlug(input.providerModel),
    );
    await completeAndExpectIngested({ ...input, secretKey });
  });
}

/**
 * Sends one request through the gateway, then waits until Langfuse stored its
 * observation with the provider's model, usage and a computed cost.
 */
export async function completeAndExpectIngested(input: CompletionRequest) {
  const { apiFormat, providerModel } = input;
  const response = await fetch(`${suite.gatewayBaseUrl}${input.path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.secretKey}`,
      "Content-Type": "application/json",
      ...input.headers,
    },
    body: JSON.stringify(input.body),
  });
  const text = await response.text();
  expect(response.status, text).toBe(200);
  const payload = JSON.parse(text) as { model?: string; usage?: unknown };
  expectRequestedProviderModel(
    payload.model,
    input.responseModel ?? providerModel,
  );
  expect(payload.model).not.toContain(`${suite.connection.name}:`);
  const expectedUsage = expectedProvidedUsage(apiFormat, payload.usage);

  const traceId = response.headers.get("langfuse-trace-id");
  const observationId = response.headers.get("langfuse-observation-id");
  expect(traceId).toMatch(/^[0-9a-f]{32}$/);
  expect(observationId).toMatch(/^[0-9a-f]{16}$/);

  await waitForExpect(
    async () => {
      const observation = await getObservationByIdFromEventsTable({
        id: observationId!,
        projectId: suite.projectId,
        traceId: traceId!,
      });
      if (!observation) {
        throw new Error(`Observation ${observationId} was not found`);
      }
      expect(observation.projectId).toBe(suite.projectId);
      expect(observation.traceId).toBe(traceId);
      expect(observation.type).toBe(
        apiFormat === "openai.embeddings" ? "EMBEDDING" : "GENERATION",
      );
      expect(observation.model).toBe(payload.model);
      expect(observation.providedUsageDetails).toEqual(expectedUsage);
      if (apiFormat === "openai.embeddings") {
        expect(observation.usageDetails.total).toBe(expectedUsage.input);
      }
      expect(
        observation.totalCost,
        `no cost for ${observation.model}: ${JSON.stringify(observation.costDetails)}`,
      ).toBeGreaterThan(0);
      await expectStoredInOneProject({
        observationId: observationId!,
        traceId: traceId!,
      });
    },
    90_000,
    1_000,
  );
}

export async function gatewayControlPlaneRequest(input: {
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
    body: JSON.stringify({
      apiFormat: input.apiFormat,
      model: input.model,
      requestBytes: 0,
    }),
  });
  return readJsonResponse(response, 200, RESOLVE_PATH);
}

export async function expectGatewayError(
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

export async function ingestTrace(
  ingestionToken: string,
  apiFormat: GatewayApiFormat,
) {
  const { provider } = suite.connection;
  const traceIdBytes = randomBytes(16);
  const observationIdBytes = randomBytes(8);
  const traceId = traceIdBytes.toString("hex");
  const observationId = observationIdBytes.toString("hex");
  const startTimeUnixNano = BigInt(Date.now()) * 1_000_000n;
  // The payload claims another project everywhere a span can; ingestion must still
  // write only into the project named by the gateway token.
  const spoofedProjectId = `spoofed-${randomBytes(8).toString("hex")}`;
  const gatewayKeyId = `gateway-key-${randomBytes(8).toString("hex")}`;
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
                  name: `Gateway E2E ${provider} ${apiFormat}`,
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
                          "langfuse.gateway.api_key.id": gatewayKeyId,
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
          projectId: suite.projectId,
        }),
        getObservationByIdFromEventsTable({
          id: observationId,
          projectId: suite.projectId,
        }),
      ]);
      expect(trace?.id).toBe(traceId);
      expect(observation?.id).toBe(observationId);
      await expectStoredInOneProject({ observationId, traceId });
      const attribution = await queryClickhouse<{
        ingestion_api_key: string;
        service_name: string;
      }>({
        query: `SELECT ingestion_api_key, service_name FROM events_core
          WHERE span_id = {observationId: String} AND trace_id = {traceId: String}`,
        params: { observationId, traceId },
      });
      expect(attribution).toEqual([
        {
          ingestion_api_key: gatewayKeyId,
          service_name: "langfuse-ai-gateway",
        },
      ]);
    },
    40_000,
    1_000,
  );

  return { traceId, observationId };
}

async function addProviderConnection({ models, ...spec }: ConnectionSpec) {
  const created = await suite.admin.caller.aiGateway.createConnection({
    ...spec,
    orgId: ORGANIZATION_ID,
    // Unique per run so a connection left by an aborted run cannot collide.
    name: `e2e-${spec.provider.toLowerCase().replaceAll("_", "-")}-${randomBytes(3).toString("hex")}`,
  });
  createdConnectionId = created.id;
  expect(created.status).toBe(GatewayConnectionStatus.ENABLED);

  // Azure validates the key on a route it may list, then discovers
  // deployments on one it may not, so check the catalog as well.
  const catalog = await suite.admin.caller.aiGateway.getConnectionModels({
    orgId: ORGANIZATION_ID,
    id: created.id,
  });
  expect(catalog.success, JSON.stringify(catalog)).toBe(true);
  let { updatedAt } = created;
  if (
    created.modelListingDenied ||
    (catalog.success && catalog.modelListingDenied)
  ) {
    for (const model of models) {
      ({ updatedAt } =
        await suite.admin.caller.aiGateway.addConnectionCustomModel({
          orgId: ORGANIZATION_ID,
          id: created.id,
          model,
          expectedUpdatedAt: updatedAt,
        }));
    }
  }
  await selectOnlyConnection(created.id);
  return { id: created.id, name: created.name, provider: spec.provider };
}

async function cleanUpTestArtifacts() {
  if (apiKeyIds.size > 0) {
    await prisma.apiKey.deleteMany({
      where: { id: { in: [...apiKeyIds] } },
    });
  }
}

async function restoreProviderConnections() {
  if (createdConnectionId) {
    await prisma.gatewayAiConnection.deleteMany({
      where: { id: createdConnectionId },
    });
  }
  if (connectionSnapshots.length === 0) return;

  await prisma.$transaction(
    connectionSnapshots.map(({ id, status, updatedAt }) =>
      prisma.gatewayAiConnection.update({
        where: { id },
        data: { status, updatedAt },
      }),
    ),
  );
  await clearModelCaches([
    ...connectionSnapshots.map(({ id }) => id),
    ...(createdConnectionId ? [createdConnectionId] : []),
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
      select: { id: true, name: true, email: true },
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
    userEmail: user.email,
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
  await clearModelCaches([
    ...connectionSnapshots.map(({ id }) => id),
    targetConnectionId,
  ]);
}

async function clearModelCaches(connectionIds: string[]) {
  const catalogService = new GatewayModelCatalogService(prisma, redis);
  await Promise.all(
    connectionIds.map((connectionId) =>
      catalogService.clearModelCache(ORGANIZATION_ID, connectionId),
    ),
  );
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
    suite.projectId,
  ]);
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
  if (apiFormat === "openai.embeddings") {
    return isCountedToken(record.prompt_tokens)
      ? { input: record.prompt_tokens }
      : null;
  }
  if (apiFormat === "openai.responses" || apiFormat === "openai.decisions") {
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
    "../../../..",
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
