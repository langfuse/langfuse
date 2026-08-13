import type { Session } from "next-auth";
import { prisma, Prisma } from "@langfuse/shared/src/db";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import { createOrgProjectAndApiKey } from "@langfuse/shared/src/server";
import { LEGACY_BLOB_EXPORT_CUTOFF } from "@langfuse/shared";
import { decrypt } from "@langfuse/shared/encryption";
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

describe("PostHog Integration delete", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns NOT_FOUND when the integration is already absent", async () => {
    const { project, orgId } = await createOrgProjectAndApiKey();
    const ctx = createInnerTRPCContext({
      session: buildSession(orgId, project.id),
      headers: {},
    });
    const caller = appRouter.createCaller({ ...ctx, prisma });

    vi.spyOn(prisma.posthogIntegration, "delete").mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError(
        "Record to delete does not exist.",
        {
          code: "P2025",
          clientVersion: "test",
        },
      ),
    );

    await expect(
      caller.posthogIntegration.delete({ projectId: project.id }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
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

  // A pre-cutoff project no longer buys a *new* integration the right to a
  // legacy source: brand-new Cloud integrations are pinned to enriched events.
  // The project cutoff is still grandfathered for integrations that already
  // exist — covered in "Cloud new-integration enriched pin" below.
  it("Cloud + pre-cutoff project + legacy source on create → BAD_REQUEST", async () => {
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
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
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
        caller.posthogIntegration.update({
          projectId: project.id,
          ...baseConfig,
          exportSource: "TRACES_OBSERVATIONS" as const,
        }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });

    it("self-hosted + events_only + EVENTS → allow", async () => {
      const { caller, project } = await prepare();
      await expect(
        caller.posthogIntegration.update({
          projectId: project.id,
          ...baseConfig,
          exportSource: "EVENTS" as const,
        }),
      ).resolves.not.toThrow();
    });

    it("get returns a null config when the project has no integration", async () => {
      const { caller, project } = await prepare();
      const result = await caller.posthogIntegration.get({
        projectId: project.id,
      });
      expect(result.config).toBeNull();
    });
  });

  // The active write mode is the only input to export-source availability.
  // The V4 frontend preview flag and the per-user beta opt-in no longer
  // participate, which makes two previously-unreachable combinations behave.
  describe("enriched export sources follow the write mode alone", () => {
    const originalRegion = env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;
    const originalWriteMode = env.LANGFUSE_MIGRATION_V4_WRITE_MODE;
    const originalPreview = env.LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN;

    beforeEach(() => {
      (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = undefined;
    });

    afterEach(() => {
      (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = originalRegion;
      (env as any).LANGFUSE_MIGRATION_V4_WRITE_MODE = originalWriteMode;
      (env as any).LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN = originalPreview;
    });

    // dual writes enriched rows, so the source works — it was hidden only
    // because the frontend preview flag was off.
    it("dual + preview opt-in disabled → EVENTS accepted", async () => {
      (env as any).LANGFUSE_MIGRATION_V4_WRITE_MODE = "dual";
      (env as any).LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN = "false";
      const { caller, project } = await prepare();
      await expect(
        caller.posthogIntegration.update({
          projectId: project.id,
          ...baseConfig,
          exportSource: "EVENTS" as const,
        }),
      ).resolves.not.toThrow();
    });

    it("dual + preview opt-in disabled → TRACES_OBSERVATIONS_EVENTS accepted", async () => {
      (env as any).LANGFUSE_MIGRATION_V4_WRITE_MODE = "dual";
      (env as any).LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN = "false";
      const { caller, project } = await prepare();
      await expect(
        caller.posthogIntegration.update({
          projectId: project.id,
          ...baseConfig,
          exportSource: "TRACES_OBSERVATIONS_EVENTS" as const,
        }),
      ).resolves.not.toThrow();
    });

    // legacy writes no enriched rows: accepting the source here only defers
    // the failure to export time.
    it("legacy + preview opt-in enabled → EVENTS rejected", async () => {
      (env as any).LANGFUSE_MIGRATION_V4_WRITE_MODE = "legacy";
      (env as any).LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN = "true";
      const { caller, project } = await prepare();
      await expect(
        caller.posthogIntegration.update({
          projectId: project.id,
          ...baseConfig,
          exportSource: "EVENTS" as const,
        }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });

    it("legacy + preview opt-in enabled → TRACES_OBSERVATIONS_EVENTS rejected", async () => {
      (env as any).LANGFUSE_MIGRATION_V4_WRITE_MODE = "legacy";
      (env as any).LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN = "true";
      const { caller, project } = await prepare();
      await expect(
        caller.posthogIntegration.update({
          projectId: project.id,
          ...baseConfig,
          exportSource: "TRACES_OBSERVATIONS_EVENTS" as const,
        }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });

    it("legacy → TRACES_OBSERVATIONS accepted", async () => {
      (env as any).LANGFUSE_MIGRATION_V4_WRITE_MODE = "legacy";
      const { caller, project } = await prepare();
      await expect(
        caller.posthogIntegration.update({
          projectId: project.id,
          ...baseConfig,
          exportSource: "TRACES_OBSERVATIONS" as const,
        }),
      ).resolves.not.toThrow();
    });

    // The write mode is server-only, so the settings page can only learn it
    // from this response.
    it.each(["legacy", "dual", "events_only"] as const)(
      "get returns the active write mode %s, independent of the preview opt-in",
      async (writeMode) => {
        (env as any).LANGFUSE_MIGRATION_V4_WRITE_MODE = writeMode;
        (env as any).LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN = "false";
        const { caller, project } = await prepare();
        const result = await caller.posthogIntegration.get({
          projectId: project.id,
        });
        expect(result.writeMode).toBe(writeMode);
      },
    );
  });

  // LFE-10148 review: the form schema's zod default must not be injected into
  // partial updates — an omitted exportSource preserves the persisted value
  // (capability-checked only), and CREATE picks an explicit, validated default.
  describe("PostHog partial updates and create defaults", () => {
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
      await caller.posthogIntegration.update({
        projectId: project.id,
        ...baseConfig,
        exportSource: "EVENTS" as const,
      });
      await caller.posthogIntegration.update({
        projectId: project.id,
        ...baseConfig,
        enabled: false,
      });
      const result = await caller.posthogIntegration.get({
        projectId: project.id,
      });
      expect(result.config?.exportSource).toBe("EVENTS");
      expect(result.config?.enabled).toBe(false);
    });

    it("update omitting exportSource succeeds on events_only with persisted EVENTS", async () => {
      const { caller, project } = await prepare();
      await caller.posthogIntegration.update({
        projectId: project.id,
        ...baseConfig,
        exportSource: "EVENTS" as const,
      });
      (env as any).LANGFUSE_MIGRATION_V4_WRITE_MODE = "events_only";
      await expect(
        caller.posthogIntegration.update({
          projectId: project.id,
          ...baseConfig,
          enabled: false,
        }),
      ).resolves.not.toThrow();
      const result = await caller.posthogIntegration.get({
        projectId: project.id,
      });
      expect(result.config?.exportSource).toBe("EVENTS");
    });

    // Router default for an omitted exportSource: legacy writes active ?
    // TRACES_OBSERVATIONS : EVENTS. It deliberately differs from the
    // settings-page default (EVENTS on dual) — a pre-existing divergence this
    // change does not touch, pinned here so a later fix has to flip it.
    it("create without exportSource defaults to TRACES_OBSERVATIONS on dual", async () => {
      const { caller, project } = await prepare();
      await caller.posthogIntegration.update({
        projectId: project.id,
        ...baseConfig,
      });
      const result = await caller.posthogIntegration.get({
        projectId: project.id,
      });
      expect(result.config?.exportSource).toBe("TRACES_OBSERVATIONS");
    });

    it("create without exportSource defaults to TRACES_OBSERVATIONS on legacy", async () => {
      (env as any).LANGFUSE_MIGRATION_V4_WRITE_MODE = "legacy";
      const { caller, project } = await prepare();
      await caller.posthogIntegration.update({
        projectId: project.id,
        ...baseConfig,
      });
      const result = await caller.posthogIntegration.get({
        projectId: project.id,
      });
      expect(result.config?.exportSource).toBe("TRACES_OBSERVATIONS");
    });

    it("Cloud + post-cutoff project + create without exportSource → persists EVENTS", async () => {
      (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = "us";
      const { caller, project } = await prepare();
      await prisma.project.update({
        where: { id: project.id },
        data: { createdAt: POST_CUTOFF },
      });
      await caller.posthogIntegration.update({
        projectId: project.id,
        ...baseConfig,
      });
      const result = await caller.posthogIntegration.get({
        projectId: project.id,
      });
      expect(result.config?.exportSource).toBe("EVENTS");
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
        .spyOn(prisma.posthogIntegration, "findUnique")
        .mockResolvedValueOnce({
          exportSource: "TRACES_OBSERVATIONS",
          createdAt: new Date("2026-01-01T00:00:00Z"),
        } as never);
      try {
        await expect(
          caller.posthogIntegration.update({
            projectId: project.id,
            ...baseConfig,
          }),
        ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      } finally {
        spy.mockRestore();
      }
      // Transaction rolled back: nothing was persisted.
      expect(
        await prisma.posthogIntegration.findUnique({
          where: { projectId: project.id },
        }),
      ).toBeNull();
    });

    it("raced delete: the backstop re-validates as a brand-new row, not the stale pre-flight row", async () => {
      (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = "us";
      const { caller, project } = await prepare();
      // Pre-cutoff project, so the project-level gate cannot fire. The only
      // thing left that can reject is the backstop judging the CREATE on its
      // own terms.
      await prisma.project.update({
        where: { id: project.id },
        data: { createdAt: PRE_CUTOFF },
      });
      // The pre-flight read sees a row old enough to be grandfathered under
      // either exporter cutoff, so the pre-flight assert allows the legacy
      // source it carries. If the backstop then re-used this stale createdAt
      // instead of treating the resulting CREATE as a brand-new row, the legacy
      // row would be persisted and the guard would do nothing until the
      // analytics cutoff date passes.
      const spy = vi
        .spyOn(prisma.posthogIntegration, "findUnique")
        .mockResolvedValueOnce({
          exportSource: "TRACES_OBSERVATIONS",
          createdAt: new Date("2026-01-01T00:00:00Z"),
        } as never);
      try {
        await expect(
          caller.posthogIntegration.update({
            projectId: project.id,
            ...baseConfig,
          }),
        ).rejects.toMatchObject({
          code: "BAD_REQUEST",
          // Pins the cutoff path: an unrelated BAD_REQUEST (credentials,
          // validation) must not satisfy this test.
          message: expect.stringContaining("created on or after"),
        });
      } finally {
        spy.mockRestore();
      }
      expect(
        await prisma.posthogIntegration.findUnique({
          where: { projectId: project.id },
        }),
      ).toBeNull();
    });

    it("create without exportSource defaults to EVENTS on events_only", async () => {
      (env as any).LANGFUSE_MIGRATION_V4_WRITE_MODE = "events_only";
      const { caller, project } = await prepare();
      await caller.posthogIntegration.update({
        projectId: project.id,
        ...baseConfig,
      });
      const result = await caller.posthogIntegration.get({
        projectId: project.id,
      });
      expect(result.config?.exportSource).toBe("EVENTS");
    });
  });

  // New Cloud analytics integrations land on the enriched events source and
  // cannot be moved off it. Integrations that already existed before the
  // analytics exporter cutoff are grandfathered: they keep their legacy source
  // and may opt into enriched, but are never rewritten behind the user's back.
  describe("Cloud new-integration enriched pin", () => {
    const originalRegion = env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;
    const originalWriteMode = env.LANGFUSE_MIGRATION_V4_WRITE_MODE;

    // Written literally rather than imported so the expectation is the spec
    // date, not whatever the implementation happens to export.
    const ROW_PRE_ANALYTICS_CUTOFF = new Date("2026-07-01T00:00:00.000Z");
    const ROW_POST_ANALYTICS_CUTOFF = new Date("2026-09-01T00:00:00.000Z");

    beforeEach(() => {
      (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = "us";
      // dual keeps legacy writes active, so any rejection below comes from the
      // Cloud cutoff rather than the write-mode capability gate.
      (env as any).LANGFUSE_MIGRATION_V4_WRITE_MODE = "dual";
    });

    afterEach(() => {
      (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = originalRegion;
      (env as any).LANGFUSE_MIGRATION_V4_WRITE_MODE = originalWriteMode;
    });

    // Pre-cutoff project so the only Cloud gate in play is the
    // integration-level one.
    const prepareOldProject = async () => {
      const { caller, project } = await prepare();
      await prisma.project.update({
        where: { id: project.id },
        data: { createdAt: PRE_CUTOFF },
      });
      return { caller, project };
    };

    // Seeds a row of a chosen age: created while self-hosted (where legacy is
    // still selectable), then backdated.
    const seedLegacyRow = async (
      caller: Awaited<ReturnType<typeof prepare>>["caller"],
      projectId: string,
      createdAt: Date,
      exportSource: "TRACES_OBSERVATIONS" | "EVENTS" = "TRACES_OBSERVATIONS",
    ) => {
      (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = undefined;
      try {
        await caller.posthogIntegration.update({
          projectId,
          ...baseConfig,
          exportSource,
        });
      } finally {
        (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = "us";
      }
      await prisma.posthogIntegration.update({
        where: { projectId },
        data: { createdAt },
      });
    };

    it("create with no existing row persists EVENTS", async () => {
      const { caller, project } = await prepareOldProject();
      await caller.posthogIntegration.update({
        projectId: project.id,
        ...baseConfig,
      });
      const result = await caller.posthogIntegration.get({
        projectId: project.id,
      });
      expect(result.config?.exportSource).toBe("EVENTS");
    });

    it("create with an explicit legacy source → BAD_REQUEST", async () => {
      const { caller, project } = await prepareOldProject();
      await expect(
        caller.posthogIntegration.update({
          projectId: project.id,
          ...baseConfig,
          exportSource: "TRACES_OBSERVATIONS" as const,
        }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(
        await prisma.posthogIntegration.findUnique({
          where: { projectId: project.id },
        }),
      ).toBeNull();
    });

    it("pre-cutoff row with a persisted legacy source: omitted source is preserved, not rewritten", async () => {
      const { caller, project } = await prepareOldProject();
      await seedLegacyRow(caller, project.id, ROW_PRE_ANALYTICS_CUTOFF);
      await expect(
        caller.posthogIntegration.update({
          projectId: project.id,
          ...baseConfig,
          enabled: false,
        }),
      ).resolves.not.toThrow();
      const result = await caller.posthogIntegration.get({
        projectId: project.id,
      });
      expect(result.config?.exportSource).toBe("TRACES_OBSERVATIONS");
      expect(result.config?.enabled).toBe(false);
    });

    it("pre-cutoff row may re-assert its legacy source and may switch to enriched", async () => {
      const { caller, project } = await prepareOldProject();
      // The row predates the analytics cutoff but postdates the blob one, so
      // this also catches an adapter that forwards the blob cutoff by mistake.
      await seedLegacyRow(caller, project.id, ROW_PRE_ANALYTICS_CUTOFF);
      await expect(
        caller.posthogIntegration.update({
          projectId: project.id,
          ...baseConfig,
          exportSource: "TRACES_OBSERVATIONS" as const,
        }),
      ).resolves.not.toThrow();
      await caller.posthogIntegration.update({
        projectId: project.id,
        ...baseConfig,
        exportSource: "EVENTS" as const,
      });
      const result = await caller.posthogIntegration.get({
        projectId: project.id,
      });
      expect(result.config?.exportSource).toBe("EVENTS");
    });

    it("post-cutoff row requesting a legacy source → BAD_REQUEST", async () => {
      const { caller, project } = await prepareOldProject();
      await seedLegacyRow(
        caller,
        project.id,
        ROW_POST_ANALYTICS_CUTOFF,
        "EVENTS",
      );
      await expect(
        caller.posthogIntegration.update({
          projectId: project.id,
          ...baseConfig,
          exportSource: "TRACES_OBSERVATIONS" as const,
        }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      const result = await caller.posthogIntegration.get({
        projectId: project.id,
      });
      expect(result.config?.exportSource).toBe("EVENTS");
    });

    it("self-hosted on the legacy write mode is untouched by the pin", async () => {
      (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = undefined;
      (env as any).LANGFUSE_MIGRATION_V4_WRITE_MODE = "legacy";
      const { caller, project } = await prepareOldProject();
      await caller.posthogIntegration.update({
        projectId: project.id,
        ...baseConfig,
      });
      const created = await caller.posthogIntegration.get({
        projectId: project.id,
      });
      expect(created.config?.exportSource).toBe("TRACES_OBSERVATIONS");
      await expect(
        caller.posthogIntegration.update({
          projectId: project.id,
          ...baseConfig,
          exportSource: "EVENTS" as const,
        }),
      ).resolves.not.toThrow();
    });
  });

  // LFE-14384: the credential is write-only — get returns only a masked
  // display value; a blank key on update keeps the persisted encrypted value.
  describe("PostHog credential masking", () => {
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

    it("get returns a masked display value, never the plaintext key", async () => {
      const { caller, project } = await prepare();
      await caller.posthogIntegration.update({
        projectId: project.id,
        ...baseConfig,
      });
      const result = await caller.posthogIntegration.get({
        projectId: project.id,
      });
      expect(result.config).not.toHaveProperty("posthogApiKey");
      // Last-4-only: leading characters of the key are real secret material.
      expect(result.config?.posthogApiKeyDisplay).toBe(
        "..." + baseConfig.posthogProjectApiKey.slice(-4),
      );
      expect(JSON.stringify(result)).not.toContain(
        baseConfig.posthogProjectApiKey,
      );
    });

    it("update with a blank key keeps the existing credential", async () => {
      const { caller, project } = await prepare();
      await caller.posthogIntegration.update({
        projectId: project.id,
        ...baseConfig,
      });
      await caller.posthogIntegration.update({
        projectId: project.id,
        ...baseConfig,
        posthogProjectApiKey: "",
        enabled: false,
      });
      const row = await prisma.posthogIntegration.findUniqueOrThrow({
        where: { projectId: project.id },
      });
      expect(decrypt(row.encryptedPosthogApiKey)).toBe(
        baseConfig.posthogProjectApiKey,
      );
      expect(row.enabled).toBe(false);
    });

    it("create with a blank key → BAD_REQUEST", async () => {
      const { caller, project } = await prepare();
      await expect(
        caller.posthogIntegration.update({
          projectId: project.id,
          ...baseConfig,
          posthogProjectApiKey: "",
        }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });
  });
});
