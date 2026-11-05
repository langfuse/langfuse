import { generateKeyPairSync, randomUUID } from "crypto";
import type { Session } from "next-auth";

import { testFeatureFlags } from "@/src/__tests__/fixtures/feature-flags";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import { LLMAdapter } from "@langfuse/shared";
import { decrypt } from "@langfuse/shared/encryption";
import { prisma } from "@langfuse/shared/src/db";
import { env as sharedEnv } from "@langfuse/shared/src/env";
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

  it("stores an OAuth2 connection with a private JWK and keeps it on scope changes", async () => {
    const tokenEndpoint = "https://1.1.1.1/oauth2/token";
    const originalAllowedTokenEndpoints =
      sharedEnv.LANGFUSE_LLM_OAUTH2_ALLOWED_TOKEN_ENDPOINTS;
    sharedEnv.LANGFUSE_LLM_OAUTH2_ALLOWED_TOKEN_ENDPOINTS = [tokenEndpoint];
    try {
      const setup = await createOrgProjectAndApiKey();
      const caller = createCaller(
        createSession({
          orgId: setup.orgId,
          projectId: setup.projectId,
          orgRole: "OWNER",
          projectRole: "ADMIN",
        }),
      );
      const jwk = {
        ...generateKeyPairSync("ec", {
          namedCurve: "P-256",
        }).privateKey.export({ format: "jwk" }),
        kid: "t1",
      };
      const oauth2 = {
        provider: "custom" as const,
        tokenEndpoint,
        clientId: "agent-x",
        authMethod: "private_key_jwt" as const,
      };

      const created = await caller.organizationLlmApiKey.create({
        orgId: setup.orgId,
        provider: "gateway",
        adapter: LLMAdapter.OpenAI,
        secretKey: JSON.stringify(jwk),
        config: { oauth2 },
      });
      expect(created).toMatchObject({
        displaySecretKey: "kid:t1",
        config: { oauth2 },
      });
      expect(JSON.stringify(created)).not.toContain(jwk.d!);

      await caller.organizationLlmApiKey.update({
        id: created.id,
        orgId: setup.orgId,
        provider: "gateway",
        adapter: LLMAdapter.OpenAI,
        config: { oauth2: { ...oauth2, scope: "llm.read" } },
      });
      await expect(
        caller.organizationLlmApiKey.update({
          id: created.id,
          orgId: setup.orgId,
          provider: "gateway",
          adapter: LLMAdapter.OpenAI,
          config: { oauth2: { ...oauth2, clientId: "other" } },
        }),
      ).rejects.toThrow("A new secret is required when");

      const stored = await prisma.llmApiKeys.findUniqueOrThrow({
        where: { id: created.id },
      });
      expect(decrypt(stored.secretKey)).toBe(JSON.stringify(jwk));
      expect(stored.config).toEqual({
        oauth2: { ...oauth2, scope: "llm.read" },
      });
    } finally {
      sharedEnv.LANGFUSE_LLM_OAUTH2_ALLOWED_TOKEN_ENDPOINTS =
        originalAllowedTokenEndpoints;
    }
  });
});
