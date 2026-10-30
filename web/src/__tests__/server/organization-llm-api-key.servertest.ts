const mockListOpenAIConnectionModels = vi.hoisted(() => vi.fn());

vi.mock("@langfuse/shared/src/server", async () => {
  const actual = await vi.importActual("@langfuse/shared/src/server");
  return {
    ...actual,
    listOpenAIConnectionModels: mockListOpenAIConnectionModels,
  };
});

import { randomUUID } from "crypto";
import type { Session } from "next-auth";

import { testFeatureFlags } from "@/src/__tests__/fixtures/feature-flags";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import { LLMAdapter } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { createOrgProjectAndApiKey } from "@langfuse/shared/src/server";

const createSession = (params: {
  orgId: string;
  projectId: string;
  orgRole: "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";
  projectRole: "ADMIN" | "MEMBER" | "VIEWER";
}): Session => ({
  expires: "1",
  user: {
    id: randomUUID(),
    name: "LLM connection test user",
    canCreateOrganizations: true,
    organizations: [
      {
        id: params.orgId,
        role: params.orgRole,
        plan: "cloud:hobby",
        cloudConfig: undefined,
        name: "Test Organization",
        metadata: {},
        aiFeaturesEnabled: false,
        aiTelemetryEnabled: false,
        projects: [
          {
            id: params.projectId,
            role: params.projectRole,
            name: "Test Project",
            deletedAt: null,
            retentionDays: null,
            hasTraces: false,
            metadata: {},
            createdAt: new Date().toISOString(),
          },
        ],
      },
    ],
    featureFlags: testFeatureFlags(),
    admin: false,
  },
  environment: {} as never,
});

const createCaller = (session: Session) => {
  const ctx = createInnerTRPCContext({ session, headers: {} });
  return appRouter.createCaller({ ...ctx, prisma });
};

describe("organization LLM connections", () => {
  beforeEach(() => {
    mockListOpenAIConnectionModels.mockReset();
  });

  it("lets an owner manage a connection without exposing its secret", async () => {
    const setup = await createOrgProjectAndApiKey();
    const caller = createCaller(
      createSession({
        orgId: setup.orgId,
        projectId: setup.projectId,
        orgRole: "OWNER",
        projectRole: "ADMIN",
      }),
    );

    const created = await caller.organizationLlmApiKey.create({
      orgId: setup.orgId,
      provider: "openai",
      adapter: LLMAdapter.OpenAI,
      secretKey: "sk-organization-test",
    });
    expect(created).not.toHaveProperty("secretKey");

    const result = await caller.organizationLlmApiKey.all({
      orgId: setup.orgId,
    });
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({
      id: created.id,
      organizationId: setup.orgId,
      scope: "organization",
      provider: "openai",
    });
    expect(result.data[0]).not.toHaveProperty("secretKey");
    expect(result.data[0]).not.toHaveProperty("extraHeaders");
  });

  it("rejects an incompatible organization connection without blocking edits to an existing mismatch", async () => {
    const setup = await createOrgProjectAndApiKey();
    const caller = createCaller(
      createSession({
        orgId: setup.orgId,
        projectId: setup.projectId,
        orgRole: "OWNER",
        projectRole: "ADMIN",
      }),
    );
    const provider = `incompatible-organization-connection-${randomUUID()}`;
    await prisma.llmApiKeys.create({
      data: {
        projectId: setup.projectId,
        provider,
        adapter: LLMAdapter.Anthropic,
        secretKey: "encrypted-project-secret",
        displaySecretKey: "...cret",
      },
    });

    await expect(
      caller.organizationLlmApiKey.create({
        orgId: setup.orgId,
        provider,
        adapter: LLMAdapter.OpenAI,
        secretKey: "organization-secret",
      }),
    ).rejects.toThrow(
      "Project and organization connections with the same provider name must use the same adapter.",
    );

    const incompatibleOrganizationConnection = await prisma.llmApiKeys.create({
      data: {
        organizationId: setup.orgId,
        provider,
        adapter: LLMAdapter.OpenAI,
        secretKey: "encrypted-organization-secret",
        displaySecretKey: "...cret",
      },
    });
    await expect(
      caller.organizationLlmApiKey.update({
        id: incompatibleOrganizationConnection.id,
        orgId: setup.orgId,
        provider,
        adapter: LLMAdapter.OpenAI,
        customModels: ["gpt-5"],
      }),
    ).resolves.toMatchObject({
      id: incompatibleOrganizationConnection.id,
      customModels: ["gpt-5"],
    });
  });

  it("lets a project viewer read inherited metadata but not organization settings", async () => {
    const setup = await createOrgProjectAndApiKey();
    await prisma.llmApiKeys.create({
      data: {
        organizationId: setup.orgId,
        provider: "anthropic",
        adapter: LLMAdapter.Anthropic,
        secretKey: "encrypted-test-value",
        displaySecretKey: "...test",
      },
    });
    const caller = createCaller(
      createSession({
        orgId: setup.orgId,
        projectId: setup.projectId,
        orgRole: "MEMBER",
        projectRole: "VIEWER",
      }),
    );

    await expect(
      caller.organizationLlmApiKey.all({ orgId: setup.orgId }),
    ).rejects.toThrow("does not have access");

    const inherited = await caller.llmApiKey.inherited({
      projectId: setup.projectId,
    });
    expect(inherited).toEqual([
      expect.objectContaining({
        provider: "anthropic",
        organizationId: setup.orgId,
        overriddenByProject: false,
      }),
    ]);
    expect(inherited[0]).not.toHaveProperty("secretKey");
  });

  it("does not list an organization connection overridden by a project decision model", async () => {
    const setup = await createOrgProjectAndApiKey();
    await prisma.llmApiKeys.createMany({
      data: [
        {
          organizationId: setup.orgId,
          provider: "shared-provider",
          adapter: LLMAdapter.OpenAI,
          secretKey: "encrypted-organization-openai",
          displaySecretKey: "...open",
        },
        {
          projectId: setup.projectId,
          provider: "shared-provider",
          adapter: LLMAdapter.TypeSafe,
          secretKey: "encrypted-project-typesafe",
          displaySecretKey: "...safe",
        },
      ],
    });
    const caller = createCaller(
      createSession({
        orgId: setup.orgId,
        projectId: setup.projectId,
        orgRole: "MEMBER",
        projectRole: "VIEWER",
      }),
    );

    const effective = await caller.llmApiKey.effective({
      projectId: setup.projectId,
    });

    expect(effective.data).toEqual([]);
  });

  it("requires organization connection management to fetch a connection's models", async () => {
    const setup = await createOrgProjectAndApiKey();
    const caller = createCaller(
      createSession({
        orgId: setup.orgId,
        projectId: setup.projectId,
        orgRole: "MEMBER",
        projectRole: "ADMIN",
      }),
    );

    await expect(
      caller.organizationLlmApiKey.listModels({
        orgId: setup.orgId,
        provider: "openai",
        adapter: LLMAdapter.OpenAI,
        secretKey: "sk-test",
        baseURL: "https://attacker.example.com/v1",
      }),
    ).rejects.toThrow("does not have access");
    expect(mockListOpenAIConnectionModels).not.toHaveBeenCalled();
  });

  it("requires organization connection management to fetch an existing connection's models", async () => {
    const setup = await createOrgProjectAndApiKey();
    const owner = createCaller(
      createSession({
        orgId: setup.orgId,
        projectId: setup.projectId,
        orgRole: "OWNER",
        projectRole: "ADMIN",
      }),
    );
    const created = await owner.organizationLlmApiKey.create({
      orgId: setup.orgId,
      provider: "openai",
      adapter: LLMAdapter.OpenAI,
      secretKey: "sk-organization-test",
    });
    const member = createCaller(
      createSession({
        orgId: setup.orgId,
        projectId: setup.projectId,
        orgRole: "MEMBER",
        projectRole: "ADMIN",
      }),
    );

    await expect(
      member.organizationLlmApiKey.listModelsUpdate({
        id: created.id,
        orgId: setup.orgId,
        provider: "openai",
        adapter: LLMAdapter.OpenAI,
      }),
    ).rejects.toThrow("does not have access");
    expect(mockListOpenAIConnectionModels).not.toHaveBeenCalled();
  });

  it("does not fetch the models of another organization's connection", async () => {
    const [ownSetup, otherSetup] = await Promise.all([
      createOrgProjectAndApiKey(),
      createOrgProjectAndApiKey(),
    ]);
    const otherConnection = await createCaller(
      createSession({
        orgId: otherSetup.orgId,
        projectId: otherSetup.projectId,
        orgRole: "OWNER",
        projectRole: "ADMIN",
      }),
    ).organizationLlmApiKey.create({
      orgId: otherSetup.orgId,
      provider: "openai",
      adapter: LLMAdapter.OpenAI,
      secretKey: "sk-other-organization",
    });
    const caller = createCaller(
      createSession({
        orgId: ownSetup.orgId,
        projectId: ownSetup.projectId,
        orgRole: "OWNER",
        projectRole: "ADMIN",
      }),
    );

    const result = await caller.organizationLlmApiKey.listModelsUpdate({
      id: otherConnection.id,
      orgId: ownSetup.orgId,
      provider: "openai",
      adapter: LLMAdapter.OpenAI,
    });

    expect(result).toEqual({
      success: false,
      error: "LLM connection not found",
    });
    expect(mockListOpenAIConnectionModels).not.toHaveBeenCalled();
  });

  it("rejects organization access across tenants", async () => {
    const [ownSetup, otherSetup] = await Promise.all([
      createOrgProjectAndApiKey(),
      createOrgProjectAndApiKey(),
    ]);
    const caller = createCaller(
      createSession({
        orgId: ownSetup.orgId,
        projectId: ownSetup.projectId,
        orgRole: "OWNER",
        projectRole: "ADMIN",
      }),
    );

    await expect(
      caller.organizationLlmApiKey.all({ orgId: otherSetup.orgId }),
    ).rejects.toThrow("not a member of this organization");
  });
});
