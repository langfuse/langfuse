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
import { BLOB_EXPORT_FIELD_GROUPS } from "@langfuse/shared";

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
}: {
  projectId: string;
  enabled?: boolean;
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
          payload: {
            projectId: project.id,
          },
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
      expect(result?.exportFieldGroups).toStrictEqual(["core", "io"]);
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
        ...BLOB_EXPORT_FIELD_GROUPS,
      ]);
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
      expect(result?.exportFieldGroups).toStrictEqual([
        "core",
        "io",
        "metrics",
      ]);
    });
  });
});
