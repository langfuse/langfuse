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

  it("lists inherited connections unless a project connection overrides the provider", async () => {
    const setup = await createOrgProjectAndApiKey();
    await prisma.llmApiKeys.createMany({
      data: [
        {
          organizationId: setup.orgId,
          provider: "openai",
          adapter: LLMAdapter.OpenAI,
          secretKey: "encrypted-organization-openai",
          displaySecretKey: "...open",
        },
        {
          organizationId: setup.orgId,
          provider: "anthropic",
          adapter: LLMAdapter.Anthropic,
          secretKey: "encrypted-organization-anthropic",
          displaySecretKey: "...thro",
        },
        {
          projectId: setup.projectId,
          provider: "openai",
          adapter: LLMAdapter.OpenAI,
          secretKey: "encrypted-project-openai",
          displaySecretKey: "...proj",
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

    expect(effective.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provider: "openai",
          scope: "project",
        }),
        expect.objectContaining({
          provider: "anthropic",
          scope: "organization",
        }),
      ]),
    );
    expect(effective.data).toHaveLength(2);
    expect(effective.data.every((connection) => !connection.secretKey)).toBe(
      true,
    );
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
