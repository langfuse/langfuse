import { generateKeyPairSync, randomUUID } from "node:crypto";

import type { Session } from "next-auth";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as SharedServer from "@langfuse/shared/src/server";

vi.mock("@langfuse/shared/src/server", async (importOriginal) => {
  const actual = await importOriginal<typeof SharedServer>();
  return {
    ...actual,
    testModelCall: vi.fn().mockResolvedValue(undefined),
  };
});

import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import { env } from "@/src/env.mjs";
import {
  createGatewayHmacSignature,
  GatewayProviderService,
  type GatewayResolveError,
  GatewayResolveService,
  verifyGatewayIngestionToken,
} from "@/src/features/llm-gateway/server";
import { prisma, Role } from "@langfuse/shared/src/db";
import { decrypt } from "@langfuse/shared/encryption";

const cleanupOrganizations: string[] = [];
const cleanupUsers: string[] = [];

afterEach(async () => {
  await prisma.organization.deleteMany({
    where: { id: { in: cleanupOrganizations.splice(0) } },
  });
  await prisma.user.deleteMany({
    where: { id: { in: cleanupUsers.splice(0) } },
  });
  vi.clearAllMocks();
});

async function prepare(role: Role = Role.OWNER) {
  const suffix = randomUUID();
  const user = await prisma.user.create({
    data: { email: `gateway-${suffix}@example.test`, name: "Gateway tester" },
  });
  const org = await prisma.organization.create({
    data: { name: `Gateway org ${suffix}` },
  });
  const project = await prisma.project.create({
    data: { name: "Gateway ingestion", orgId: org.id },
  });
  await prisma.organizationMembership.create({
    data: { orgId: org.id, userId: user.id, role },
  });
  cleanupOrganizations.push(org.id);
  cleanupUsers.push(user.id);

  const session: Session = {
    expires: "1",
    user: {
      id: user.id,
      name: user.name,
      canCreateOrganizations: true,
      featureFlags: {} as NonNullable<Session["user"]>["featureFlags"],
      organizations: [
        {
          id: org.id,
          name: org.name,
          role,
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
  const ctx = createInnerTRPCContext({ session, headers: {} });
  return {
    org,
    project,
    user,
    caller: appRouter.createCaller({ ...ctx, prisma }),
  };
}

describe("LLM gateway control plane", () => {
  it("creates a private ingestion project and blocks implicit member access", async () => {
    const owner = await prepare();
    const existingMember = await prisma.user.create({
      data: { email: `gateway-member-${randomUUID()}@example.test` },
    });
    cleanupUsers.push(existingMember.id);
    await prisma.organizationMembership.create({
      data: {
        orgId: owner.org.id,
        userId: existingMember.id,
        role: "MEMBER",
      },
    });

    const config = await owner.caller.llmGateway.updateConfig({
      orgId: owner.org.id,
      defaultIngestionProjectId: null,
      createProjectName: "llm-ingestion-project",
      instrumentationMode: "USAGE",
    });
    const ingestionProjectId = config.defaultIngestionProjectId;
    expect(ingestionProjectId).not.toBeNull();
    if (!ingestionProjectId) throw new Error("Missing ingestion project");
    const project = await prisma.project.findFirstOrThrow({
      where: { id: ingestionProjectId },
    });
    const memberships = await prisma.projectMembership.findMany({
      where: { projectId: project.id },
      orderBy: { userId: "asc" },
    });
    expect(memberships).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ userId: owner.user.id, role: "OWNER" }),
        expect.objectContaining({ userId: existingMember.id, role: "NONE" }),
      ]),
    );

    const futureMember = await prisma.user.create({
      data: { email: `gateway-future-${randomUUID()}@example.test` },
    });
    cleanupUsers.push(futureMember.id);
    await prisma.organizationMembership.create({
      data: {
        orgId: owner.org.id,
        userId: futureMember.id,
        role: "MEMBER",
      },
    });
    await expect(
      prisma.projectMembership.findUnique({
        where: {
          projectId_userId: {
            projectId: project.id,
            userId: futureMember.id,
          },
        },
      }),
    ).resolves.toMatchObject({ role: "NONE" });
  });

  it("enforces admin scope and validates the ingestion project organization", async () => {
    const owner = await prepare();
    const member = await prepare(Role.MEMBER);

    await expect(
      member.caller.llmGateway.updateConfig({
        orgId: member.org.id,
        defaultIngestionProjectId: member.project.id,
        instrumentationMode: "USAGE",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await expect(
      owner.caller.llmGateway.updateConfig({
        orgId: owner.org.id,
        defaultIngestionProjectId: member.project.id,
        instrumentationMode: "USAGE",
      }),
    ).rejects.toThrow("active project in the organization");
  });

  it("stores provider credentials encrypted and never returns them", async () => {
    const { caller, org } = await prepare();
    const credential = "sk-test-gateway-redaction";
    const created = await caller.llmGateway.createConnection({
      orgId: org.id,
      name: "OpenAI primary",
      provider: "OPENAI",
      credential,
    });

    expect(SharedServer.testModelCall).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "openai",
        model: "gpt-4o-mini",
        apiKey: expect.objectContaining({
          baseURL: "https://api.openai.com/v1",
          secretKey: expect.not.stringContaining(credential),
        }),
      }),
    );
    expect(created).not.toHaveProperty("encryptedCredential");
    expect(created).not.toHaveProperty("credential");
    const listed = await caller.llmGateway.listConnections({ orgId: org.id });
    expect(listed.data[0]).not.toHaveProperty("encryptedCredential");
    expect(JSON.stringify(listed)).not.toContain(credential);

    const stored = await prisma.gatewayAiConnection.findUniqueOrThrow({
      where: { id: created.id },
      select: { encryptedCredential: true },
    });
    expect(stored.encryptedCredential).not.toBe(credential);
    expect(decrypt(stored.encryptedCredential)).toBe(credential);
  });

  it("creates, lists, and revokes only associated organization keys", async () => {
    const { caller, org } = await prepare();
    const created = await caller.llmGateway.createApiKey({
      orgId: org.id,
      note: "Production gateway",
      metadata: { environment: "production", costCenter: 42 },
    });
    expect(created.secretKey).toMatch(/^sk-lf-/);

    const listed = await caller.llmGateway.listApiKeys({ orgId: org.id });
    expect(listed.data).toHaveLength(1);
    expect(listed.data[0]).toMatchObject({
      apiKey: { id: created.id, note: "Production gateway" },
      metadata: { environment: "production", costCenter: 42 },
    });
    expect(JSON.stringify(listed)).not.toContain(created.secretKey);

    await expect(
      caller.llmGateway.createApiKey({
        orgId: org.id,
        metadata: { nested: { rejected: true } } as never,
      }),
    ).rejects.toThrow();

    await expect(
      caller.llmGateway.revokeApiKey({ orgId: org.id, id: created.id }),
    ).resolves.toEqual({ success: true });
    expect(
      await prisma.gatewayApiKeyAssociation.findUnique({
        where: { apiKeyId: created.id },
      }),
    ).toBeNull();
  });

  it("cursor-paginates provider connections", async () => {
    const { caller, org } = await prepare();

    for (const name of ["First", "Second", "Third"]) {
      await caller.llmGateway.createConnection({
        orgId: org.id,
        name,
        provider: "OPENAI",
        credential: `sk-test-${name.toLowerCase()}`,
      });
    }

    const firstConnections = await caller.llmGateway.listConnections({
      orgId: org.id,
      limit: 2,
    });
    expect(firstConnections.data.map((connection) => connection.name)).toEqual([
      "First",
      "Second",
    ]);
    expect(firstConnections.nextCursor).toBeTruthy();
    const remainingConnections = await caller.llmGateway.listConnections({
      orgId: org.id,
      limit: 2,
      cursor: firstConnections.nextCursor ?? undefined,
    });
    expect(
      remainingConnections.data.map((connection) => connection.name),
    ).toEqual(["Third"]);
    expect(remainingConnections.nextCursor).toBeNull();
  });

  it("cursor-paginates gateway keys", async () => {
    const { caller, org } = await prepare();

    for (const note of ["First", "Second", "Third"]) {
      await caller.llmGateway.createApiKey({
        orgId: org.id,
        note,
        metadata: {},
      });
    }

    const firstKeys = await caller.llmGateway.listApiKeys({
      orgId: org.id,
      limit: 2,
    });
    expect(firstKeys.data).toHaveLength(2);
    expect(firstKeys.nextCursor).toBeTruthy();
    const remainingKeys = await caller.llmGateway.listApiKeys({
      orgId: org.id,
      limit: 2,
      cursor: firstKeys.nextCursor ?? undefined,
    });
    expect(remainingKeys.data).toHaveLength(1);
    expect(remainingKeys.nextCursor).toBeNull();
  });

  it("rejects gateway page limits above 100", async () => {
    const { caller, org } = await prepare();

    await expect(
      caller.llmGateway.listConnections({ orgId: org.id, limit: 101 }),
    ).rejects.toThrow();
    await expect(
      caller.llmGateway.listApiKeys({ orgId: org.id, limit: 101 }),
    ).rejects.toThrow();
  });

  it("routes by format and priority and issues a verifiable ingestion token", async () => {
    const { caller, org, project } = await prepare();
    await caller.llmGateway.updateConfig({
      orgId: org.id,
      defaultIngestionProjectId: project.id,
      instrumentationMode: "FULL",
    });
    const openRouter = await caller.llmGateway.createConnection({
      orgId: org.id,
      name: "OpenRouter first",
      provider: "OPENROUTER",
      credential: "sk-test-openrouter",
    });
    await caller.llmGateway.createConnection({
      orgId: org.id,
      name: "OpenAI second",
      provider: "OPENAI",
      credential: "sk-test-openai",
    });
    const gatewayKey = await caller.llmGateway.createApiKey({
      orgId: org.id,
      metadata: {},
    });

    const signingKeys = generateKeyPairSync("ed25519");
    const serviceKey = "test-control-plane-service-key";
    const timestamp = Math.floor(Date.now() / 1000);
    const apiFormat = "openai.chat-completions" as const;
    const gatewayAuthorization = `HMAC keyId=current,timestamp=${timestamp},signature=${createGatewayHmacSignature(
      {
        timestamp,
        virtualSecretKey: gatewayKey.secretKey,
        apiFormat,
        serviceKey,
      },
    )}`;
    const result = await new GatewayResolveService(prisma, {
      salt: env.SALT,
      serviceKeys: [{ id: "current", secret: serviceKey }],
      jwt: {
        privateKey: signingKeys.privateKey
          .export({ format: "pem", type: "pkcs8" })
          .toString(),
        keyId: "current",
        issuer: "test-issuer",
        audience: "test-audience",
      },
    }).resolve({
      virtualSecretKey: gatewayKey.secretKey,
      apiFormat,
      gatewayAuthorization,
    });

    expect(openRouter.routingPriority).toBe(0);
    expect(result.connection).toEqual({
      api_format: apiFormat,
      base_url: "https://openrouter.ai/api/v1",
      auth: { type: "Bearer", token: "sk-test-openrouter" },
    });
    expect(
      verifyGatewayIngestionToken({
        token: result.ingestion!.access_token,
        issuer: "test-issuer",
        audience: "test-audience",
        publicKeys: [
          {
            id: "current",
            publicKey: signingKeys.publicKey
              .export({ format: "pem", type: "spki" })
              .toString(),
          },
        ],
      }),
    ).toMatchObject({
      organizationId: org.id,
      projectId: project.id,
      keyId: gatewayKey.id,
      instrumentation_mode: "full",
    });
  });

  it("changes ERROR only for credential auth failures and explicit recovery", async () => {
    const { caller, org } = await prepare();
    const connection = await caller.llmGateway.createConnection({
      orgId: org.id,
      name: "Anthropic",
      provider: "ANTHROPIC",
      credential: "sk-ant-test",
    });
    const unauthorizedFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 401 }));
    const unauthorized = new GatewayProviderService(prisma, unauthorizedFetch);
    await unauthorized.refreshModels({
      organizationId: org.id,
      connectionId: connection.id,
      explicitRetry: false,
    });
    expect(
      await prisma.gatewayAiConnection.findUnique({
        where: { id: connection.id },
        select: { status: true },
      }),
    ).toEqual({ status: "ERROR" });
    await expect(
      caller.llmGateway.updateConnection({
        orgId: org.id,
        id: connection.id,
        status: "ENABLED",
      }),
    ).rejects.toThrow("credential update or successful retry");
    const automaticRefresh = vi.fn<typeof fetch>();
    await new GatewayProviderService(prisma, automaticRefresh).refreshAllModels(
      org.id,
    );
    expect(automaticRefresh).not.toHaveBeenCalled();

    const failingFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 500 }));
    await new GatewayProviderService(prisma, failingFetch).refreshModels({
      organizationId: org.id,
      connectionId: connection.id,
      explicitRetry: true,
    });
    expect(
      await prisma.gatewayAiConnection.findUnique({
        where: { id: connection.id },
        select: { status: true },
      }),
    ).toEqual({ status: "ERROR" });

    const successfulFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ data: [{ id: "claude-test" }] }));
    await new GatewayProviderService(prisma, successfulFetch).refreshModels({
      organizationId: org.id,
      connectionId: connection.id,
      explicitRetry: true,
    });
    expect(
      await prisma.gatewayAiConnection.findUnique({
        where: { id: connection.id },
        select: { status: true },
      }),
    ).toEqual({ status: "ENABLED" });
  });

  it("blocks resolve after the default ingestion project is deleted", async () => {
    const { caller, org, project } = await prepare();
    await caller.llmGateway.updateConfig({
      orgId: org.id,
      defaultIngestionProjectId: project.id,
      instrumentationMode: "NONE",
    });
    await caller.llmGateway.createConnection({
      orgId: org.id,
      name: "OpenAI",
      provider: "OPENAI",
      credential: "sk-test",
    });
    const key = await caller.llmGateway.createApiKey({
      orgId: org.id,
      metadata: {},
    });
    await prisma.project.update({
      where: { id: project.id },
      data: { deletedAt: new Date() },
    });
    const timestamp = Math.floor(Date.now() / 1000);
    const serviceKey = "service";
    await expect(
      new GatewayResolveService(prisma, {
        salt: env.SALT,
        serviceKeys: [{ id: "current", secret: serviceKey }],
      }).resolve({
        virtualSecretKey: key.secretKey,
        apiFormat: "openai.responses",
        gatewayAuthorization: `HMAC keyId=current,timestamp=${timestamp},signature=${createGatewayHmacSignature(
          {
            timestamp,
            virtualSecretKey: key.secretKey,
            apiFormat: "openai.responses",
            serviceKey,
          },
        )}`,
      }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<GatewayResolveError>>({ status: 403 }),
    );
  });
});
