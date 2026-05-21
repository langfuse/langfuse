import type { Session } from "next-auth";
import { prisma } from "@langfuse/shared/src/db";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import { createOrgProjectAndApiKey } from "@langfuse/shared/src/server";
import { LEGACY_BLOB_EXPORT_CUTOFF } from "@langfuse/shared";
import { env } from "@/src/env.mjs";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const PRE_CUTOFF = new Date(LEGACY_BLOB_EXPORT_CUTOFF.getTime() - MS_PER_DAY);
const POST_CUTOFF = new Date(LEGACY_BLOB_EXPORT_CUTOFF.getTime() + MS_PER_DAY);

const buildSession = (orgId: string, projectId: string): Session => ({
  expires: "1",
  user: {
    id: "user-1",
    name: "Demo User",
    canCreateOrganizations: true,
    organizations: [
      {
        id: orgId,
        role: "OWNER",
        plan: "cloud:hobby",
        cloudConfig: undefined,
        name: "Test Organization",
        metadata: {},
        projects: [
          {
            id: projectId,
            role: "ADMIN",
            name: "Test Project",
            deletedAt: null,
            retentionDays: null,
            metadata: {},
          },
        ],
      },
    ],
    featureFlags: {
      templateFlag: true,
      excludeClickhouseRead: false,
    },
    admin: true,
  },
  environment: {} as any,
});

describe("PostHog Integration SSRF Protection", () => {
  const originalEncryptionKey = process.env.ENCRYPTION_KEY;
  let projectId: string;
  let orgId: string;
  let caller: ReturnType<typeof appRouter.createCaller>;

  beforeAll(() => {
    // Set a test encryption key (64 hex characters = 32 bytes)
    process.env.ENCRYPTION_KEY =
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  });

  afterAll(() => {
    // Restore original environment
    process.env.ENCRYPTION_KEY = originalEncryptionKey;
  });

  beforeEach(async () => {
    const setup = await createOrgProjectAndApiKey();
    projectId = setup.projectId;
    orgId = setup.orgId;

    const ctx = createInnerTRPCContext({
      session: buildSession(orgId, projectId),
      headers: {},
    });
    caller = appRouter.createCaller({ ...ctx, prisma });
  });

  it("should reject private IPs and localhost in PostHog hostname", async () => {
    await expect(
      caller.posthogIntegration.update({
        projectId,
        posthogHostname: "http://localhost",
        posthogProjectApiKey: "phc_test_key_12345",
        enabled: true,
      }),
    ).rejects.toThrow(/Invalid PostHog hostname.*Blocked/);
  });
});

describe("PostHog Integration legacy export source cutoff gate", () => {
  const originalEncryptionKey = process.env.ENCRYPTION_KEY;

  beforeAll(() => {
    process.env.ENCRYPTION_KEY =
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  });

  afterAll(() => {
    process.env.ENCRYPTION_KEY = originalEncryptionKey;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // PostHog uses webhook URL validation that rejects private IPs — including
  // public DNS hosts the test container can reach is overkill for unit-testing
  // the cutoff gate. We exercise the gate against a stable public hostname.
  const baseConfig = {
    posthogHostname: "https://us.posthog.com",
    posthogProjectApiKey: "phc_test_key_12345",
    enabled: true,
  };

  const prepare = async () => {
    const { project, orgId } = await createOrgProjectAndApiKey();
    const ctx = createInnerTRPCContext({
      session: buildSession(orgId, project.id),
      headers: {},
    });
    const caller = appRouter.createCaller({ ...ctx, prisma });
    return { project, caller };
  };

  it("Cloud + pre-cutoff project + legacy source → allow", async () => {
    const originalRegion = env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;
    (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = "us";
    try {
      const { caller, project } = await prepare();
      await prisma.project.update({
        where: { id: project.id },
        data: { createdAt: PRE_CUTOFF },
      });
      await expect(
        caller.posthogIntegration.update({
          projectId: project.id,
          ...baseConfig,
          exportSource: "TRACES_OBSERVATIONS" as const,
        }),
      ).resolves.not.toThrow();
    } finally {
      (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = originalRegion;
    }
  });

  it("Cloud + post-cutoff project + legacy source → BAD_REQUEST", async () => {
    const originalRegion = env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;
    (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = "us";
    try {
      const { caller, project } = await prepare();
      await prisma.project.update({
        where: { id: project.id },
        data: { createdAt: POST_CUTOFF },
      });
      await expect(
        caller.posthogIntegration.update({
          projectId: project.id,
          ...baseConfig,
          exportSource: "TRACES_OBSERVATIONS" as const,
        }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    } finally {
      (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = originalRegion;
    }
  });

  it("Cloud + post-cutoff project + TRACES_OBSERVATIONS_EVENTS → BAD_REQUEST", async () => {
    const originalRegion = env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;
    (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = "us";
    try {
      const { caller, project } = await prepare();
      await prisma.project.update({
        where: { id: project.id },
        data: { createdAt: POST_CUTOFF },
      });
      await expect(
        caller.posthogIntegration.update({
          projectId: project.id,
          ...baseConfig,
          exportSource: "TRACES_OBSERVATIONS_EVENTS" as const,
        }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    } finally {
      (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = originalRegion;
    }
  });

  it("Cloud + post-cutoff project + EVENTS → allow", async () => {
    const originalRegion = env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;
    (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = "us";
    try {
      const { caller, project } = await prepare();
      await prisma.project.update({
        where: { id: project.id },
        data: { createdAt: POST_CUTOFF },
      });
      await expect(
        caller.posthogIntegration.update({
          projectId: project.id,
          ...baseConfig,
          exportSource: "EVENTS" as const,
        }),
      ).resolves.not.toThrow();
    } finally {
      (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = originalRegion;
    }
  });

  it("self-hosted + post-cutoff project + legacy source → allow (bypass)", async () => {
    const originalRegion = env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;
    (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = undefined;
    try {
      const { caller, project } = await prepare();
      await prisma.project.update({
        where: { id: project.id },
        data: { createdAt: POST_CUTOFF },
      });
      await expect(
        caller.posthogIntegration.update({
          projectId: project.id,
          ...baseConfig,
          exportSource: "TRACES_OBSERVATIONS" as const,
        }),
      ).resolves.not.toThrow();
    } finally {
      (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = originalRegion;
    }
  });
});
