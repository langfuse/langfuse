import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import { prisma, type Role } from "@langfuse/shared/src/db";
import { env as sharedEnv } from "@langfuse/shared/src/env";
import { createOrgProjectAndApiKey } from "@langfuse/shared/src/server";
import { env } from "@/src/env.mjs";
import type { Session } from "next-auth";

const llmMocks = vi.hoisted(() => ({
  generateLLMText: vi.fn(async () => ({ text: "[]" })),
}));

// Stub the published LLM helper rather than the shared server barrel: the
// barrel is also imported by `@langfuse/shared/src/db`, and mocking it breaks
// Prisma setup. `langfuseAiCompletion` is not a package export, so tsc cannot
// resolve a mock of that path.
vi.mock("@langfuse/shared/src/server/llm/llmText", async () => {
  const actual = await vi.importActual(
    "@langfuse/shared/src/server/llm/llmText",
  );
  return {
    ...actual,
    generateLLMText: llmMocks.generateLLMText,
  };
});

// Both Ask AI endpoints only generate a filter over data the caller can
// already read, so they are gated on `project:read` — a VIEWER must get in.
const NO_ACCESS = "User does not have access to this resource or action";

const __orgIds: string[] = [];

async function prepare(projectRole: Role) {
  const { project, org } = await createOrgProjectAndApiKey();
  __orgIds.push(org.id);

  const session: Session = {
    expires: "1",
    user: {
      id: "user-1",
      canCreateOrganizations: false,
      name: "Demo User",
      admin: false,
      organizations: [
        {
          id: org.id,
          name: org.name,
          role: "MEMBER",
          plan: "cloud:hobby",
          cloudConfig: undefined,
          metadata: {},
          aiFeaturesEnabled: false,
          aiTelemetryEnabled: false,
          projects: [
            {
              id: project.id,
              role: projectRole,
              retentionDays: 30,
              deletedAt: null,
              hasTraces: false,
              name: project.name,
              metadata: {},
              createdAt: new Date().toISOString(),
            },
          ],
        },
      ],
      featureFlags: {
        excludeClickhouseRead: false,
        templateFlag: false,
        searchBar: true,
        v4BetaToggleVisible: false,
        observationEvals: false,
        experimentsV4Enabled: false,
      },
    },
    environment: {
      enableExperimentalFeatures: false,
      selfHostedInstancePlan: "cloud:hobby",
    },
  };

  const ctx = createInnerTRPCContext({ session, headers: {} });
  return { project, org, caller: appRouter.createCaller({ ...ctx, prisma }) };
}

/** Message of a rejection, or "" when the call resolved. */
const failureMessage = (promise: Promise<unknown>) =>
  promise.then(
    () => "",
    (error: unknown) =>
      error instanceof Error ? error.message : String(error),
  );

describe("Ask AI filter generation access", () => {
  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: { in: __orgIds } } });
  });

  // The org's `aiFeaturesEnabled` is off, so the v4 call still fails on the
  // org-level AI gate right after RBAC. The leftover wand is Cloud-only and
  // may fail that gate first. Only the RBAC verdict is asserted here.
  it("lets a VIEWER through the RBAC gate on both endpoints", async () => {
    const { project, caller } = await prepare("VIEWER");

    expect(
      await failureMessage(
        caller.naturalLanguageFilters.createCompletion({
          projectId: project.id,
          prompt: "traces from today",
        }),
      ),
    ).not.toContain(NO_ACCESS);

    expect(
      await failureMessage(
        caller.searchBar.generateFilter({
          projectId: project.id,
          prompt: "traces from today",
        }),
      ),
    ).not.toContain(NO_ACCESS);
  });

  it("rejects a project role without project:read on both endpoints", async () => {
    const { project, caller } = await prepare("NONE");

    await expect(
      caller.naturalLanguageFilters.createCompletion({
        projectId: project.id,
        prompt: "traces from today",
      }),
    ).rejects.toThrow(NO_ACCESS);

    await expect(
      caller.searchBar.generateFilter({
        projectId: project.id,
        prompt: "traces from today",
      }),
    ).rejects.toThrow(NO_ACCESS);
  });

  it("generates Ask AI on self-hosted and keeps Filter with AI Cloud-only", async () => {
    const originalCloudRegion = env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;
    const originalBedrockModel = env.LANGFUSE_AWS_BEDROCK_MODEL;
    const originalBedrockSmallModel = env.LANGFUSE_AWS_BEDROCK_SMALL_MODEL;
    const originalAiFeaturesProjectId =
      sharedEnv.LANGFUSE_AI_FEATURES_PROJECT_ID;

    (
      env as { NEXT_PUBLIC_LANGFUSE_CLOUD_REGION?: string }
    ).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = undefined;
    (
      env as { LANGFUSE_AWS_BEDROCK_MODEL?: string }
    ).LANGFUSE_AWS_BEDROCK_MODEL = "test-model";
    (
      env as { LANGFUSE_AWS_BEDROCK_SMALL_MODEL?: string }
    ).LANGFUSE_AWS_BEDROCK_SMALL_MODEL = undefined;
    (
      sharedEnv as { LANGFUSE_AI_FEATURES_PROJECT_ID?: string }
    ).LANGFUSE_AI_FEATURES_PROJECT_ID = undefined;
    llmMocks.generateLLMText.mockClear();

    try {
      const { project, org, caller } = await prepare("VIEWER");
      await prisma.organization.update({
        where: { id: org.id },
        data: { aiFeaturesEnabled: true, aiTelemetryEnabled: true },
      });

      await expect(
        caller.naturalLanguageFilters.createCompletion({
          projectId: project.id,
          prompt: "traces from today",
        }),
      ).rejects.toThrow(
        "Natural language filtering is not available in self-hosted deployments.",
      );
      expect(llmMocks.generateLLMText).not.toHaveBeenCalled();

      await expect(
        caller.searchBar.generateFilter({
          projectId: project.id,
          prompt: "traces from today",
        }),
      ).resolves.toMatchObject({ filters: [] });
      expect(llmMocks.generateLLMText).toHaveBeenCalledOnce();
    } finally {
      (
        env as { NEXT_PUBLIC_LANGFUSE_CLOUD_REGION?: string }
      ).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = originalCloudRegion;
      (
        env as { LANGFUSE_AWS_BEDROCK_MODEL?: string }
      ).LANGFUSE_AWS_BEDROCK_MODEL = originalBedrockModel;
      (
        env as { LANGFUSE_AWS_BEDROCK_SMALL_MODEL?: string }
      ).LANGFUSE_AWS_BEDROCK_SMALL_MODEL = originalBedrockSmallModel;
      (
        sharedEnv as { LANGFUSE_AI_FEATURES_PROJECT_ID?: string }
      ).LANGFUSE_AI_FEATURES_PROJECT_ID = originalAiFeaturesProjectId;
    }
  });
});
