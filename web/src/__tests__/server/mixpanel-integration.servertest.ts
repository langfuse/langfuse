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
        aiFeaturesEnabled: false,
        aiTelemetryEnabled: false,
        projects: [
          {
            id: projectId,
            role: "ADMIN",
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
    featureFlags: {
      searchBar: false,
      templateFlag: true,
      excludeClickhouseRead: false,
      observationEvals: false,
      v4BetaToggleVisible: false,
      experimentsV4Enabled: false,
    },
    admin: true,
  },
  environment: {} as any,
});

describe("Mixpanel Integration legacy export source cutoff gate", () => {
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

  const baseConfig = {
    mixpanelRegion: "api" as const,
    mixpanelProjectToken: "test_token_12345",
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
        caller.mixpanelIntegration.update({
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
        caller.mixpanelIntegration.update({
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
        caller.mixpanelIntegration.update({
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
        caller.mixpanelIntegration.update({
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
        caller.mixpanelIntegration.update({
          projectId: project.id,
          ...baseConfig,
          exportSource: "TRACES_OBSERVATIONS" as const,
        }),
      ).resolves.not.toThrow();
    } finally {
      (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = originalRegion;
    }
  });

  // LFE-10148: events_only no longer writes the v3 tables, so legacy sources
  // are refused by data capability, independent of Cloud date cutoffs.
  describe("events_only write-mode gate", () => {
    const originalRegion = env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;
    const originalWriteMode = env.LANGFUSE_MIGRATION_V4_WRITE_MODE;

    beforeEach(() => {
      (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = undefined;
      (env as any).LANGFUSE_MIGRATION_V4_WRITE_MODE = "events_only";
    });

    afterEach(() => {
      (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = originalRegion;
      (env as any).LANGFUSE_MIGRATION_V4_WRITE_MODE = originalWriteMode;
    });

    it("self-hosted + events_only + legacy source → BAD_REQUEST", async () => {
      const { caller, project } = await prepare();
      await expect(
        caller.mixpanelIntegration.update({
          projectId: project.id,
          ...baseConfig,
          exportSource: "TRACES_OBSERVATIONS" as const,
        }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });

    it("self-hosted + events_only + EVENTS → allow", async () => {
      const { caller, project } = await prepare();
      await expect(
        caller.mixpanelIntegration.update({
          projectId: project.id,
          ...baseConfig,
          exportSource: "EVENTS" as const,
        }),
      ).resolves.not.toThrow();
    });

    it("get returns legacyWritesActive=false on events_only", async () => {
      const { caller, project } = await prepare();
      const result = await caller.mixpanelIntegration.get({
        projectId: project.id,
      });
      expect(result.legacyWritesActive).toBe(false);
      expect(result.config).toBeNull();
    });

    it("get returns legacyWritesActive=true on dual, with config", async () => {
      (env as any).LANGFUSE_MIGRATION_V4_WRITE_MODE = "dual";
      const { caller, project } = await prepare();
      await caller.mixpanelIntegration.update({
        projectId: project.id,
        ...baseConfig,
        exportSource: "EVENTS" as const,
      });
      const result = await caller.mixpanelIntegration.get({
        projectId: project.id,
      });
      expect(result.legacyWritesActive).toBe(true);
      expect(result.config?.exportSource).toBe("EVENTS");
    });
  });

  // LFE-10148 review: the form schema's zod default must not be injected into
  // partial updates — an omitted exportSource preserves the persisted value
  // (capability-checked only), and CREATE picks an explicit, validated default.
  describe("Mixpanel partial updates and create defaults", () => {
    const originalRegion = env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;
    const originalWriteMode = env.LANGFUSE_MIGRATION_V4_WRITE_MODE;

    beforeEach(() => {
      (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = undefined;
      (env as any).LANGFUSE_MIGRATION_V4_WRITE_MODE = "dual";
    });

    afterEach(() => {
      (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = originalRegion;
      (env as any).LANGFUSE_MIGRATION_V4_WRITE_MODE = originalWriteMode;
    });

    it("update omitting exportSource preserves a persisted EVENTS value (dual)", async () => {
      const { caller, project } = await prepare();
      await caller.mixpanelIntegration.update({
        projectId: project.id,
        ...baseConfig,
        exportSource: "EVENTS" as const,
      });
      await caller.mixpanelIntegration.update({
        projectId: project.id,
        ...baseConfig,
        enabled: false,
      });
      const result = await caller.mixpanelIntegration.get({
        projectId: project.id,
      });
      expect(result.config?.exportSource).toBe("EVENTS");
      expect(result.config?.enabled).toBe(false);
    });

    it("update omitting exportSource succeeds on events_only with persisted EVENTS", async () => {
      const { caller, project } = await prepare();
      await caller.mixpanelIntegration.update({
        projectId: project.id,
        ...baseConfig,
        exportSource: "EVENTS" as const,
      });
      (env as any).LANGFUSE_MIGRATION_V4_WRITE_MODE = "events_only";
      await expect(
        caller.mixpanelIntegration.update({
          projectId: project.id,
          ...baseConfig,
          enabled: false,
        }),
      ).resolves.not.toThrow();
      const result = await caller.mixpanelIntegration.get({
        projectId: project.id,
      });
      expect(result.config?.exportSource).toBe("EVENTS");
    });

    it("create without exportSource defaults to TRACES_OBSERVATIONS on dual", async () => {
      const { caller, project } = await prepare();
      await caller.mixpanelIntegration.update({
        projectId: project.id,
        ...baseConfig,
      });
      const result = await caller.mixpanelIntegration.get({
        projectId: project.id,
      });
      expect(result.config?.exportSource).toBe("TRACES_OBSERVATIONS");
    });

    it("Cloud + post-cutoff project + create without exportSource → BAD_REQUEST (validated default)", async () => {
      (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = "us";
      const { caller, project } = await prepare();
      await prisma.project.update({
        where: { id: project.id },
        data: { createdAt: POST_CUTOFF },
      });
      await expect(
        caller.mixpanelIntegration.update({
          projectId: project.id,
          ...baseConfig,
        }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });

    it("raced delete between read and write: mis-created legacy row is rolled back (post-cutoff Cloud)", async () => {
      (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = "us";
      const { caller, project } = await prepare();
      await prisma.project.update({
        where: { id: project.id },
        data: { createdAt: POST_CUTOFF },
      });
      // Simulate the TOCTOU: the pre-flight read sees a row that a concurrent
      // delete removes before the upsert, flipping it into a CREATE carrying
      // the legacy default. The in-transaction backstop must roll it back.
      const spy = vi
        .spyOn(prisma.mixpanelIntegration, "findUnique")
        .mockResolvedValueOnce({
          exportSource: "TRACES_OBSERVATIONS",
          createdAt: new Date("2026-01-01T00:00:00Z"),
        } as never);
      try {
        await expect(
          caller.mixpanelIntegration.update({
            projectId: project.id,
            ...baseConfig,
          }),
        ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      } finally {
        spy.mockRestore();
      }
      // Transaction rolled back: nothing was persisted.
      expect(
        await prisma.mixpanelIntegration.findUnique({
          where: { projectId: project.id },
        }),
      ).toBeNull();
    });

    it("create without exportSource defaults to EVENTS on events_only", async () => {
      (env as any).LANGFUSE_MIGRATION_V4_WRITE_MODE = "events_only";
      const { caller, project } = await prepare();
      await caller.mixpanelIntegration.update({
        projectId: project.id,
        ...baseConfig,
      });
      const result = await caller.mixpanelIntegration.get({
        projectId: project.id,
      });
      expect(result.config?.exportSource).toBe("EVENTS");
    });
  });
});
