import type { Mock } from "vitest";
import type { Session } from "next-auth";

import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import { encrypt } from "@langfuse/shared/encryption";
import { prisma } from "@langfuse/shared/src/db";
import {
  BlobStorageIntegrationProcessingQueue,
  createOrgProjectAndApiKey,
  QueueJobs,
  StorageServiceFactory,
} from "@langfuse/shared/src/server";
import {
  OBSERVATION_FIELD_GROUPS_FULL,
  LEGACY_BLOB_EXPORT_CUTOFF,
  LEGACY_BLOB_EXPORTER_CUTOFF,
} from "@langfuse/shared";
import { env } from "@/src/env.mjs";
import { env as sharedEnv } from "@langfuse/shared/src/env";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const PRE_CUTOFF = new Date(LEGACY_BLOB_EXPORT_CUTOFF.getTime() - MS_PER_DAY);
const POST_CUTOFF = new Date(LEGACY_BLOB_EXPORT_CUTOFF.getTime() + MS_PER_DAY);
// Integration-level cutoff applied to BlobStorageIntegration.createdAt.
const INTEGRATION_PRE_CUTOFF = new Date(
  LEGACY_BLOB_EXPORTER_CUTOFF.getTime() - MS_PER_DAY,
);
const INTEGRATION_POST_CUTOFF = new Date(
  LEGACY_BLOB_EXPORTER_CUTOFF.getTime() + MS_PER_DAY,
);

vi.mock("@langfuse/shared/src/server", async () => {
  const actual = await vi.importActual("@langfuse/shared/src/server");
  return {
    ...actual,
    BlobStorageIntegrationProcessingQueue: {
      getInstance: vi.fn(),
    },
    StorageServiceFactory: {
      getInstance: vi.fn(),
    },
  };
});

const __orgIds: string[] = [];

const prepare = async () => {
  const { project, org } = await createOrgProjectAndApiKey();

  const session: Session = {
    expires: "1",
    user: {
      id: "user-1",
      canCreateOrganizations: true,
      name: "Demo User",
      organizations: [
        {
          id: org.id,
          name: org.name,
          role: "OWNER",
          plan: "cloud:hobby",
          cloudConfig: undefined,
          metadata: {},
          projects: [
            {
              id: project.id,
              role: "ADMIN",
              retentionDays: 30,
              deletedAt: null,
              name: project.name,
              metadata: {},
            },
          ],
        },
      ],
      featureFlags: {
        excludeClickhouseRead: false,
        templateFlag: true,
      },
      admin: true,
    },
    environment: {
      enableExperimentalFeatures: false,
      selfHostedInstancePlan: "cloud:hobby",
    },
  };

  const ctx = createInnerTRPCContext({ session, headers: {} });
  const caller = appRouter.createCaller({ ...ctx, prisma });

  __orgIds.push(org.id);

  return { project, org, session, ctx, caller };
};

const createIntegration = async ({
  projectId,
  enabled = true,
  exportSource,
}: {
  projectId: string;
  enabled?: boolean;
  exportSource?:
    | "TRACES_OBSERVATIONS"
    | "TRACES_OBSERVATIONS_EVENTS"
    | "EVENTS";
}) =>
  prisma.blobStorageIntegration.create({
    data: {
      projectId,
      type: "S3",
      bucketName: "test-bucket",
      region: "us-east-1",
      accessKeyId: "test-access-key",
      secretAccessKey: encrypt("test-secret-key"),
      prefix: "test/",
      exportFrequency: "daily",
      enabled,
      forcePathStyle: false,
      fileType: "JSONL",
      exportMode: "FULL_HISTORY",
      ...(exportSource ? { exportSource } : {}),
    },
  });

const findAuditLog = async ({
  projectId,
  action,
}: {
  projectId: string;
  action: string;
}) =>
  prisma.auditLog.findFirst({
    where: {
      projectId,
      resourceType: "blobStorageIntegration",
      resourceId: projectId,
      action,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

const parseAuditLogAfter = (after: string | null) =>
  after ? (JSON.parse(after) as Record<string, unknown>) : null;

// Base config for tRPC update calls (exportFieldGroups tests).
// exportSource EVENTS triggers field-group validation.
const baseConfig = {
  type: "S3" as const,
  bucketName: "test-bucket",
  endpoint: null,
  region: "us-east-1",
  accessKeyId: "AKIA123456789",
  secretAccessKey: "secret123456789",
  prefix: "exports/",
  exportFrequency: "daily" as const,
  enabled: true,
  forcePathStyle: false,
  fileType: "JSONL" as const,
  exportMode: "FULL_HISTORY" as const,
  exportStartDate: null,
  compressed: true,
  exportSource: "EVENTS" as const,
};

describe("Blob Storage Integration tRPC Router", () => {
  afterAll(async () => {
    await prisma.auditLog.deleteMany({
      where: {
        orgId: { in: __orgIds },
      },
    });
    await prisma.organization.deleteMany({
      where: {
        id: { in: __orgIds },
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  describe("runNow", () => {
    it("creates a success audit log when a manual run is queued", async () => {
      const add = vi.fn().mockResolvedValue(undefined);
      (
        BlobStorageIntegrationProcessingQueue.getInstance as Mock
      ).mockReturnValue({ add });

      const { caller, project } = await prepare();
      await createIntegration({ projectId: project.id });

      const result = await caller.blobStorageIntegration.runNow({
        projectId: project.id,
      });

      expect(result.success).toBe(true);
      expect(add).toHaveBeenCalledWith(
        QueueJobs.BlobStorageIntegrationProcessingJob,
        expect.objectContaining({
          name: QueueJobs.BlobStorageIntegrationProcessingJob,
          payload: expect.objectContaining({
            projectId: project.id,
          }),
        }),
        expect.objectContaining({
          jobId: result.jobId,
        }),
      );

      const auditLog = await findAuditLog({
        projectId: project.id,
        action: "runNow",
      });
      expect(auditLog).toBeDefined();
      expect(parseAuditLogAfter(auditLog?.after ?? null)).toMatchObject({
        outcome: "success",
        jobId: result.jobId,
      });
    });

    it("creates a failure audit log when a manual run cannot be queued", async () => {
      (
        BlobStorageIntegrationProcessingQueue.getInstance as Mock
      ).mockReturnValue(null);

      const { caller, project } = await prepare();
      await createIntegration({ projectId: project.id });

      await expect(
        caller.blobStorageIntegration.runNow({ projectId: project.id }),
      ).rejects.toThrow();

      const auditLog = await findAuditLog({
        projectId: project.id,
        action: "runNow",
      });
      expect(auditLog).toBeDefined();
      expect(parseAuditLogAfter(auditLog?.after ?? null)).toMatchObject({
        outcome: "failure",
        error: "INTERNAL_SERVER_ERROR",
      });
    });

    it("does not fail a queued manual run when success audit logging fails", async () => {
      const add = vi.fn().mockResolvedValue(undefined);
      (
        BlobStorageIntegrationProcessingQueue.getInstance as Mock
      ).mockReturnValue({ add });
      const auditLogCreateSpy = vi
        .spyOn(prisma.auditLog, "create")
        .mockRejectedValueOnce(new Error("audit log unavailable"));

      const { caller, project } = await prepare();
      await createIntegration({ projectId: project.id });

      const result = await caller.blobStorageIntegration.runNow({
        projectId: project.id,
      });

      expect(result.success).toBe(true);
      expect(add).toHaveBeenCalledTimes(1);
      expect(auditLogCreateSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("validate", () => {
    it("creates a success audit log when validation uploads a test file", async () => {
      const uploadWithSignedUrl = vi.fn().mockResolvedValue({
        signedUrl: "https://signed.example/upload",
      });
      (StorageServiceFactory.getInstance as Mock).mockReturnValue({
        uploadWithSignedUrl,
      });

      const { caller, project } = await prepare();
      await createIntegration({ projectId: project.id });

      const result = await caller.blobStorageIntegration.validate({
        projectId: project.id,
      });

      expect(result.success).toBe(true);
      expect(uploadWithSignedUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          fileName: result.testFileName,
          fileType: "text/plain",
          expiresInSeconds: 3600,
        }),
      );

      const auditLog = await findAuditLog({
        projectId: project.id,
        action: "validate",
      });
      expect(auditLog).toBeDefined();
      const after = parseAuditLogAfter(auditLog?.after ?? null);
      expect(after).toMatchObject({
        outcome: "success",
        testFileName: result.testFileName,
      });
      expect(JSON.stringify(after)).not.toContain("signed.example");
    });

    it("creates a failure audit log when validation upload fails", async () => {
      (StorageServiceFactory.getInstance as Mock).mockReturnValue({
        uploadWithSignedUrl: vi
          .fn()
          .mockRejectedValue(new Error("provider rejected the upload")),
      });

      const { caller, project } = await prepare();
      await createIntegration({ projectId: project.id });

      await expect(
        caller.blobStorageIntegration.validate({ projectId: project.id }),
      ).rejects.toThrow("Validation failed");

      const auditLog = await findAuditLog({
        projectId: project.id,
        action: "validate",
      });
      expect(auditLog).toBeDefined();
      const after = parseAuditLogAfter(auditLog?.after ?? null);
      expect(after).toMatchObject({
        outcome: "failure",
        error: "Error",
      });
      expect(JSON.stringify(after)).not.toContain("provider rejected");
    });

    it("does not fail validation when success audit logging fails", async () => {
      const uploadWithSignedUrl = vi.fn().mockResolvedValue({
        signedUrl: "https://signed.example/upload",
      });
      (StorageServiceFactory.getInstance as Mock).mockReturnValue({
        uploadWithSignedUrl,
      });
      const auditLogCreateSpy = vi
        .spyOn(prisma.auditLog, "create")
        .mockRejectedValueOnce(new Error("audit log unavailable"));

      const { caller, project } = await prepare();
      await createIntegration({ projectId: project.id });

      const result = await caller.blobStorageIntegration.validate({
        projectId: project.id,
      });

      expect(result.success).toBe(true);
      expect(uploadWithSignedUrl).toHaveBeenCalledTimes(1);
      expect(auditLogCreateSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("endpoint validation", () => {
    const originalAllowedIps =
      sharedEnv.LANGFUSE_BLOB_STORAGE_ENDPOINT_WHITELISTED_IPS;
    const originalSharedCloudRegion =
      sharedEnv.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;

    beforeEach(() => {
      sharedEnv.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = undefined;
    });

    afterEach(() => {
      sharedEnv.LANGFUSE_BLOB_STORAGE_ENDPOINT_WHITELISTED_IPS =
        originalAllowedIps;
      sharedEnv.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = originalSharedCloudRegion;
    });

    it.each(["S3_COMPATIBLE", "AZURE_BLOB_STORAGE"] as const)(
      "rejects %s endpoints that target blocked IP ranges when validation is enabled",
      async (type) => {
        sharedEnv.LANGFUSE_BLOB_STORAGE_ENDPOINT_WHITELISTED_IPS = [
          "203.0.113.10",
        ];
        const { caller, project } = await prepare();

        await expect(
          caller.blobStorageIntegration.update({
            projectId: project.id,
            ...baseConfig,
            type,
            endpoint: "http://127.0.0.1:9000",
          }),
        ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      },
    );

    it("allows endpoints when their IP is whitelisted", async () => {
      const { env: validationEnv } =
        await import("../../../../packages/shared/src/env");
      const { validateBlobStorageEndpoint } =
        await import("../../../../packages/shared/src/server/services/blobStorageEndpointValidation");
      const originalValidationCloudRegion =
        validationEnv.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;
      const originalValidationAllowedIps =
        validationEnv.LANGFUSE_BLOB_STORAGE_ENDPOINT_WHITELISTED_IPS;

      try {
        validationEnv.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = undefined;
        validationEnv.LANGFUSE_BLOB_STORAGE_ENDPOINT_WHITELISTED_IPS = [
          "127.0.0.1",
        ];

        await expect(
          validateBlobStorageEndpoint("http://127.0.0.1:9000"),
        ).resolves.not.toThrow();
      } finally {
        validationEnv.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION =
          originalValidationCloudRegion;
        validationEnv.LANGFUSE_BLOB_STORAGE_ENDPOINT_WHITELISTED_IPS =
          originalValidationAllowedIps;
      }
    });
  });

  describe("exportFieldGroups", () => {
    it("stores a custom subset and round-trips via get", async () => {
      const { caller, project } = await prepare();

      await caller.blobStorageIntegration.update({
        projectId: project.id,
        ...baseConfig,
        exportFieldGroups: ["core", "io"],
      });

      const result = await caller.blobStorageIntegration.get({
        projectId: project.id,
      });
      expect(result?.config?.exportFieldGroups).toStrictEqual(["core", "io"]);
    });

    it("defaults to all groups when exportFieldGroups is omitted", async () => {
      const { caller, project } = await prepare();

      await caller.blobStorageIntegration.update({
        projectId: project.id,
        ...baseConfig,
      });

      const stored = await prisma.blobStorageIntegration.findUnique({
        where: { projectId: project.id },
      });
      expect(stored?.exportFieldGroups).toStrictEqual([
        ...OBSERVATION_FIELD_GROUPS_FULL,
      ]);
    });

    it("rejects submission when core group is absent (exportSource EVENTS)", async () => {
      const { caller, project } = await prepare();

      await expect(
        caller.blobStorageIntegration.update({
          projectId: project.id,
          ...baseConfig,
          exportFieldGroups: ["basic", "io"],
        }),
      ).rejects.toThrow();
    });

    it("rejects empty exportFieldGroups when exportSource is TRACES_OBSERVATIONS_EVENTS", async () => {
      const { caller, project } = await prepare();
      await prisma.project.update({
        where: { id: project.id },
        data: { createdAt: PRE_CUTOFF },
      });

      await expect(
        caller.blobStorageIntegration.update({
          projectId: project.id,
          ...baseConfig,
          exportSource: "TRACES_OBSERVATIONS_EVENTS" as const,
          exportFieldGroups: [],
        }),
      ).rejects.toThrow();
    });

    it("rejects empty exportFieldGroups when exportSource is TRACES_OBSERVATIONS", async () => {
      const { caller, project } = await prepare();
      await prisma.project.update({
        where: { id: project.id },
        data: { createdAt: PRE_CUTOFF },
      });
      // Pre-cutoff integration row (legacy exporter) so the integration-cutoff
      // gate allows the legacy source; this test only exercises field-group
      // handling, not the cutoff.
      await createIntegration({ projectId: project.id });
      await prisma.blobStorageIntegration.update({
        where: { projectId: project.id },
        data: { createdAt: INTEGRATION_PRE_CUTOFF },
      });

      await expect(
        caller.blobStorageIntegration.update({
          projectId: project.id,
          ...baseConfig,
          exportSource: "TRACES_OBSERVATIONS" as const,
          exportFieldGroups: [],
        }),
      ).rejects.toThrow();
    });

    it("accepts a custom subset including core when exportSource is TRACES_OBSERVATIONS", async () => {
      const { caller, project } = await prepare();
      await prisma.project.update({
        where: { id: project.id },
        data: { createdAt: PRE_CUTOFF },
      });
      // Pre-cutoff integration row (legacy exporter) so the integration-cutoff
      // gate allows the legacy source; this test only exercises field-group
      // handling, not the cutoff.
      await createIntegration({ projectId: project.id });
      await prisma.blobStorageIntegration.update({
        where: { projectId: project.id },
        data: { createdAt: INTEGRATION_PRE_CUTOFF },
      });

      await caller.blobStorageIntegration.update({
        projectId: project.id,
        ...baseConfig,
        exportSource: "TRACES_OBSERVATIONS" as const,
        exportFieldGroups: ["core", "io"],
      });

      const result = await caller.blobStorageIntegration.get({
        projectId: project.id,
      });
      expect(result?.config?.exportFieldGroups).toStrictEqual(["core", "io"]);
    });

    it("overwrites stored subset when a new subset is submitted", async () => {
      const { caller, project } = await prepare();

      await caller.blobStorageIntegration.update({
        projectId: project.id,
        ...baseConfig,
        exportFieldGroups: ["core", "basic"],
      });

      await caller.blobStorageIntegration.update({
        projectId: project.id,
        ...baseConfig,
        exportFieldGroups: ["core", "io", "metrics"],
      });

      const result = await caller.blobStorageIntegration.get({
        projectId: project.id,
      });
      expect(result?.config?.exportFieldGroups).toStrictEqual([
        "core",
        "io",
        "metrics",
      ]);
    });
  });

  describe("legacy blob export source cutoff gate", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("Cloud + pre-cutoff project + pre-cutoff legacy row + legacy source → allow", async () => {
      const originalRegion = env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;
      (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = "us";
      try {
        const { caller, project } = await prepare();
        await prisma.project.update({
          where: { id: project.id },
          data: { createdAt: PRE_CUTOFF },
        });
        // The project-level gate allows pre-cutoff projects, but the
        // integration-cutoff gate also applies: a legacy source is only allowed
        // when an existing pre-cutoff row classifies the exporter as legacy.
        await createIntegration({ projectId: project.id });
        await prisma.blobStorageIntegration.update({
          where: { projectId: project.id },
          data: { createdAt: INTEGRATION_PRE_CUTOFF },
        });
        await expect(
          caller.blobStorageIntegration.update({
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
          caller.blobStorageIntegration.update({
            projectId: project.id,
            ...baseConfig,
            exportSource: "TRACES_OBSERVATIONS" as const,
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
          caller.blobStorageIntegration.update({
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
          caller.blobStorageIntegration.update({
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

  describe("get: isEnrichedExportAvailable flag", () => {
    const originalRegion = env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;
    const originalV4Preview = env.LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN;

    afterEach(() => {
      (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = originalRegion;
      (env as any).LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN =
        originalV4Preview;
    });

    it("returns true for Cloud deployments regardless of V4 flag", async () => {
      (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = "us";
      (env as any).LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN = "false";
      const { caller, project } = await prepare();
      const result = await caller.blobStorageIntegration.get({
        projectId: project.id,
      });
      expect(result.isEnrichedExportAvailable).toBe(true);
    });

    it("returns false for self-hosted without V4 preview opt-in", async () => {
      (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = undefined;
      (env as any).LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN = "false";
      const { caller, project } = await prepare();
      const result = await caller.blobStorageIntegration.get({
        projectId: project.id,
      });
      expect(result.isEnrichedExportAvailable).toBe(false);
    });

    it("returns true for self-hosted with V4 preview opt-in enabled", async () => {
      (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = undefined;
      (env as any).LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN = "true";
      const { caller, project } = await prepare();
      const result = await caller.blobStorageIntegration.get({
        projectId: project.id,
      });
      expect(result.isEnrichedExportAvailable).toBe(true);
    });
  });

  describe("update: enriched export source guard", () => {
    const originalRegion = env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;
    const originalV4Preview = env.LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN;

    afterEach(() => {
      (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = originalRegion;
      (env as any).LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN =
        originalV4Preview;
    });

    it("rejects EVENTS on self-hosted without V4 preview opt-in", async () => {
      (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = undefined;
      (env as any).LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN = "false";
      const { caller, project } = await prepare();
      await expect(
        caller.blobStorageIntegration.update({
          projectId: project.id,
          ...baseConfig,
          exportSource: "EVENTS" as const,
        }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });

    it("rejects TRACES_OBSERVATIONS_EVENTS on self-hosted without V4 preview opt-in", async () => {
      (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = undefined;
      (env as any).LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN = "false";
      const { caller, project } = await prepare();
      await prisma.project.update({
        where: { id: project.id },
        data: { createdAt: PRE_CUTOFF },
      });
      await expect(
        caller.blobStorageIntegration.update({
          projectId: project.id,
          ...baseConfig,
          exportSource: "TRACES_OBSERVATIONS_EVENTS" as const,
        }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });

    it("allows EVENTS on self-hosted with V4 preview opt-in", async () => {
      (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = undefined;
      (env as any).LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN = "true";
      const { caller, project } = await prepare();
      await expect(
        caller.blobStorageIntegration.update({
          projectId: project.id,
          ...baseConfig,
          exportSource: "EVENTS" as const,
        }),
      ).resolves.not.toThrow();
    });

    it("allows EVENTS on Cloud regardless of V4 flag", async () => {
      (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = "us";
      (env as any).LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN = "false";
      const { caller, project } = await prepare();
      await expect(
        caller.blobStorageIntegration.update({
          projectId: project.id,
          ...baseConfig,
          exportSource: "EVENTS" as const,
        }),
      ).resolves.not.toThrow();
    });
  });

  describe("legacy blob exporter (integration createdAt) cutoff gate", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    // All cases use a pre-cutoff project so the project-level delegate gate
    // allows and the integration-level cutoff is isolated.

    it("(a) Cloud + pre-cutoff project + no row + legacy → BAD_REQUEST", async () => {
      const originalRegion = env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;
      (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = "us";
      try {
        const { caller, project } = await prepare();
        await prisma.project.update({
          where: { id: project.id },
          data: { createdAt: PRE_CUTOFF },
        });
        await expect(
          caller.blobStorageIntegration.update({
            projectId: project.id,
            ...baseConfig,
            exportSource: "TRACES_OBSERVATIONS" as const,
            exportFieldGroups: ["core"],
          }),
        ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      } finally {
        (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = originalRegion;
      }
    });

    it("(b) Cloud + pre-cutoff project + row (createdAt < CUTOFF) + legacy → succeeds", async () => {
      const originalRegion = env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;
      (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = "us";
      try {
        const { caller, project } = await prepare();
        await prisma.project.update({
          where: { id: project.id },
          data: { createdAt: PRE_CUTOFF },
        });
        await createIntegration({ projectId: project.id });
        // Backdate the row to before the integration cutoff (legacy exporter).
        await prisma.blobStorageIntegration.update({
          where: { projectId: project.id },
          data: { createdAt: INTEGRATION_PRE_CUTOFF },
        });
        await expect(
          caller.blobStorageIntegration.update({
            projectId: project.id,
            ...baseConfig,
            exportSource: "TRACES_OBSERVATIONS" as const,
            exportFieldGroups: ["core"],
          }),
        ).resolves.not.toThrow();
      } finally {
        (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = originalRegion;
      }
    });

    it("(c) Cloud + pre-cutoff project + no row + EVENTS → succeeds", async () => {
      const originalRegion = env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;
      (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = "us";
      try {
        const { caller, project } = await prepare();
        await prisma.project.update({
          where: { id: project.id },
          data: { createdAt: PRE_CUTOFF },
        });
        await expect(
          caller.blobStorageIntegration.update({
            projectId: project.id,
            ...baseConfig,
            exportSource: "EVENTS" as const,
          }),
        ).resolves.not.toThrow();
      } finally {
        (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = originalRegion;
      }
    });

    it("(d) Cloud + pre-cutoff project + row (createdAt >= CUTOFF, reset-recreated) + legacy → BAD_REQUEST", async () => {
      const originalRegion = env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;
      (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = "us";
      try {
        const { caller, project } = await prepare();
        await prisma.project.update({
          where: { id: project.id },
          data: { createdAt: PRE_CUTOFF },
        });
        await createIntegration({ projectId: project.id });
        // Post-date the row to on/after the integration cutoff (not legacy).
        await prisma.blobStorageIntegration.update({
          where: { projectId: project.id },
          data: { createdAt: INTEGRATION_POST_CUTOFF },
        });
        await expect(
          caller.blobStorageIntegration.update({
            projectId: project.id,
            ...baseConfig,
            exportSource: "TRACES_OBSERVATIONS" as const,
            exportFieldGroups: ["core"],
          }),
        ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      } finally {
        (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = originalRegion;
      }
    });
  });

  // LFE-10296: an update that omits exportSource must preserve the persisted
  // value (parity with the public REST handler) — never rewrite it to the
  // legacy default — and must be rejected when preserving would keep a stale
  // enriched source alive on a deployment without the enriched export path.
  describe("update: omitted exportSource", () => {
    const originalRegion = env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;
    const originalV4Preview = env.LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN;

    afterEach(() => {
      (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = originalRegion;
      (env as any).LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN =
        originalV4Preview;
    });

    const { exportSource: _ignored, ...configWithoutExportSource } = baseConfig;

    it("preserves a persisted enriched source when enriched export is available", async () => {
      (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = undefined;
      (env as any).LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN = "true";
      const { caller, project } = await prepare();
      await createIntegration({
        projectId: project.id,
        exportSource: "EVENTS",
      });

      await caller.blobStorageIntegration.update({
        projectId: project.id,
        ...configWithoutExportSource,
      });

      const row = await prisma.blobStorageIntegration.findUniqueOrThrow({
        where: { projectId: project.id },
      });
      expect(row.exportSource).toBe("EVENTS");
    });

    it("rejects an omitted exportSource over a stale enriched row on rolled-back self-hosted", async () => {
      (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = undefined;
      (env as any).LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN = "false";
      const { caller, project } = await prepare();
      await createIntegration({
        projectId: project.id,
        exportSource: "EVENTS",
      });

      await expect(
        caller.blobStorageIntegration.update({
          projectId: project.id,
          ...configWithoutExportSource,
        }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });

      const row = await prisma.blobStorageIntegration.findUniqueOrThrow({
        where: { projectId: project.id },
      });
      expect(row.exportSource).toBe("EVENTS");
    });

    it("preserves a persisted legacy source on rolled-back self-hosted", async () => {
      (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = undefined;
      (env as any).LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN = "false";
      const { caller, project } = await prepare();
      await createIntegration({
        projectId: project.id,
        exportSource: "TRACES_OBSERVATIONS",
      });

      await caller.blobStorageIntegration.update({
        projectId: project.id,
        ...configWithoutExportSource,
      });

      const row = await prisma.blobStorageIntegration.findUniqueOrThrow({
        where: { projectId: project.id },
      });
      expect(row.exportSource).toBe("TRACES_OBSERVATIONS");
    });

    it("creates with EVENTS when exportSource is omitted for a post-cutoff Cloud project", async () => {
      // The legacy gate only checks explicit values, so an omitted
      // exportSource on CREATE must not fall through to the Prisma column
      // default (TRACES_OBSERVATIONS) — mirror of the REST handler's
      // forceEventsOnCreate behavior.
      (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = "us";
      (env as any).LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN = "false";
      const { caller, project } = await prepare();
      await prisma.project.update({
        where: { id: project.id },
        data: { createdAt: POST_CUTOFF },
      });

      await caller.blobStorageIntegration.update({
        projectId: project.id,
        ...configWithoutExportSource,
      });

      const row = await prisma.blobStorageIntegration.findUniqueOrThrow({
        where: { projectId: project.id },
      });
      expect(row.exportSource).toBe("EVENTS");
    });

    it("still allows an explicit downgrade to a legacy source on rolled-back self-hosted", async () => {
      (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = undefined;
      (env as any).LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN = "false";
      const { caller, project } = await prepare();
      await createIntegration({
        projectId: project.id,
        exportSource: "EVENTS",
      });

      await caller.blobStorageIntegration.update({
        projectId: project.id,
        ...configWithoutExportSource,
        exportSource: "TRACES_OBSERVATIONS" as const,
      });

      const row = await prisma.blobStorageIntegration.findUniqueOrThrow({
        where: { projectId: project.id },
      });
      expect(row.exportSource).toBe("TRACES_OBSERVATIONS");
    });
  });
});
