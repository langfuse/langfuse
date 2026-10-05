import type { Mock } from "vitest";
import { randomUUID } from "crypto";

import { encrypt } from "@langfuse/shared/encryption";
import { prisma } from "@langfuse/shared/src/db";
import {
  createOrgProjectAndApiKey,
  StorageServiceFactory,
} from "@langfuse/shared/src/server";
import {
  resolveExternalMediaUrl,
  testExternalMediaObject,
} from "@/src/features/blobstorage-integration/externalMediaService";

vi.mock("@langfuse/shared/src/server", async () => {
  const actual = await vi.importActual("@langfuse/shared/src/server");
  return {
    ...actual,
    StorageServiceFactory: {
      getInstance: vi.fn(),
    },
  };
});

const orgIds: string[] = [];

const prepareIntegration = async ({
  mediaPrefix,
  bucketName = "media-bucket",
  projectId,
  id,
  accessKeyId = "test-access-key",
}: {
  mediaPrefix: string | null;
  bucketName?: string;
  projectId?: string;
  id?: string;
  accessKeyId?: string;
}) => {
  const preparedProject = projectId
    ? { project: { id: projectId } }
    : await createOrgProjectAndApiKey();
  if ("org" in preparedProject) {
    orgIds.push(preparedProject.org.id);
  }
  const { project } = preparedProject;
  const integration = await prisma.blobStorageIntegration.create({
    data: {
      id,
      projectId: project.id,
      type: "S3",
      bucketName,
      region: "us-east-1",
      accessKeyId,
      secretAccessKey: encrypt("test-secret-key"),
      prefix: "exports/",
      mediaPrefix,
      mediaStorageEnabled: true,
      exportFrequency: "daily",
      enabled: true,
      forcePathStyle: false,
      fileType: "JSONL",
      exportMode: "FULL_HISTORY",
    },
  });

  return { integration, project };
};

describe("external media service", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
  });

  describe("resolveExternalMediaUrl", () => {
    it("signs an object within a scoped media prefix", async () => {
      const getSignedUrl = vi.fn().mockResolvedValue("https://signed.example");
      (StorageServiceFactory.getInstance as Mock).mockReturnValue({
        getSignedUrl,
      });
      const { project } = await prepareIntegration({
        mediaPrefix: "customer/",
      });

      const result = await resolveExternalMediaUrl({
        prisma,
        projectId: project.id,
        uri: "s3://media-bucket/customer/image.png",
      });

      expect(result.url).toBe("https://signed.example");
      expect(getSignedUrl).toHaveBeenCalledWith(
        "customer/image.png",
        300,
        false,
      );
    });

    it("rejects sibling directories outside a scoped media prefix", async () => {
      const { project } = await prepareIntegration({
        mediaPrefix: "customer/",
      });

      await expect(
        resolveExternalMediaUrl({
          prisma,
          projectId: project.id,
          uri: "s3://media-bucket/customer-other/image.png",
        }),
      ).rejects.toThrow("External media is not available");
      expect(StorageServiceFactory.getInstance).not.toHaveBeenCalled();
    });

    it("signs any key in the bucket when the media prefix is null", async () => {
      const getSignedUrl = vi.fn().mockResolvedValue("https://signed.example");
      (StorageServiceFactory.getInstance as Mock).mockReturnValue({
        getSignedUrl,
      });
      const { project } = await prepareIntegration({ mediaPrefix: null });

      const result = await resolveExternalMediaUrl({
        prisma,
        projectId: project.id,
        uri: "s3://media-bucket/any/directory/image.png",
      });

      expect(result.url).toBe("https://signed.example");
      expect(getSignedUrl).toHaveBeenCalledWith(
        "any/directory/image.png",
        300,
        false,
      );
    });

    it("signs any key in the bucket when the media prefix is blank", async () => {
      const getSignedUrl = vi.fn().mockResolvedValue("https://signed.example");
      (StorageServiceFactory.getInstance as Mock).mockReturnValue({
        getSignedUrl,
      });
      const { project } = await prepareIntegration({ mediaPrefix: "   " });

      await resolveExternalMediaUrl({
        prisma,
        projectId: project.id,
        uri: "s3://media-bucket/any/directory/image.png",
      });

      expect(getSignedUrl).toHaveBeenCalledWith(
        "any/directory/image.png",
        300,
        false,
      );
    });

    it("prefers a scoped prefix over a whole-bucket integration", async () => {
      const getSignedUrl = vi.fn().mockResolvedValue("https://signed.example");
      (StorageServiceFactory.getInstance as Mock).mockReturnValue({
        getSignedUrl,
      });
      const { project } = await prepareIntegration({
        mediaPrefix: null,
        accessKeyId: "whole-bucket",
      });
      await prepareIntegration({
        projectId: project.id,
        mediaPrefix: "customer/",
        accessKeyId: "scoped",
      });

      await resolveExternalMediaUrl({
        prisma,
        projectId: project.id,
        uri: "s3://media-bucket/customer/image.png",
      });

      expect(StorageServiceFactory.getInstance).toHaveBeenCalledWith(
        expect.objectContaining({ accessKeyId: "scoped" }),
      );
    });

    it("keeps candidate selection and credential loading tenant-scoped", async () => {
      const getSignedUrl = vi.fn().mockResolvedValue("https://signed.example");
      (StorageServiceFactory.getInstance as Mock).mockReturnValue({
        getSignedUrl,
      });
      const suffix = randomUUID();
      const { project } = await prepareIntegration({
        id: `z-${suffix}`,
        mediaPrefix: "customer/",
        accessKeyId: "tenant-integration",
      });
      await prepareIntegration({
        id: `a-${suffix}`,
        mediaPrefix: "customer/",
        accessKeyId: "other-tenant-integration",
      });

      await resolveExternalMediaUrl({
        prisma,
        projectId: project.id,
        uri: "s3://media-bucket/customer/image.png",
      });

      expect(StorageServiceFactory.getInstance).toHaveBeenCalledWith(
        expect.objectContaining({ accessKeyId: "tenant-integration" }),
      );
    });

    it("uses integration id as the tie-break for equal prefixes", async () => {
      const getSignedUrl = vi.fn().mockResolvedValue("https://signed.example");
      (StorageServiceFactory.getInstance as Mock).mockReturnValue({
        getSignedUrl,
      });
      const suffix = randomUUID();
      const { project } = await prepareIntegration({
        id: `z-${suffix}`,
        mediaPrefix: "customer/",
        accessKeyId: "later-id",
      });
      await prepareIntegration({
        id: `a-${suffix}`,
        projectId: project.id,
        mediaPrefix: "customer/",
        accessKeyId: "earlier-id",
      });

      await resolveExternalMediaUrl({
        prisma,
        projectId: project.id,
        uri: "s3://media-bucket/customer/image.png",
      });

      expect(StorageServiceFactory.getInstance).toHaveBeenCalledWith(
        expect.objectContaining({ accessKeyId: "earlier-id" }),
      );
    });

    it("applies the candidate limit after prefix matching", async () => {
      const getSignedUrl = vi.fn().mockResolvedValue("https://signed.example");
      (StorageServiceFactory.getInstance as Mock).mockReturnValue({
        getSignedUrl,
      });
      const { project, integration } = await prepareIntegration({
        id: `z-${randomUUID()}`,
        mediaPrefix: "matching/",
        accessKeyId: "matching",
      });
      await Promise.all(
        Array.from({ length: 10 }, (_, index) =>
          prepareIntegration({
            id: `a-${index.toString().padStart(2, "0")}-${randomUUID()}`,
            projectId: project.id,
            mediaPrefix: `nonmatching-prefix-${index}/`,
          }),
        ),
      );

      await resolveExternalMediaUrl({
        prisma,
        projectId: project.id,
        uri: `s3://${integration.bucketName}/matching/image.png`,
      });

      expect(StorageServiceFactory.getInstance).toHaveBeenCalledWith(
        expect.objectContaining({ accessKeyId: "matching" }),
      );
    });
  });

  describe("testExternalMediaObject", () => {
    it("probes object access and returns a signed URL for a scoped prefix", async () => {
      const verifyObjectAccess = vi.fn().mockResolvedValue(undefined);
      const getSignedUrl = vi.fn().mockResolvedValue("https://signed.example");
      (StorageServiceFactory.getInstance as Mock).mockReturnValue({
        verifyObjectAccess,
        getSignedUrl,
      });
      const { integration, project } = await prepareIntegration({
        mediaPrefix: "customer/",
      });

      const result = await testExternalMediaObject({
        prisma,
        projectId: project.id,
        integrationId: integration.id,
        uri: "s3://media-bucket/customer/image.png",
      });

      expect(result.signedUrl).toBe("https://signed.example");
      expect(verifyObjectAccess).toHaveBeenCalledWith("customer/image.png");
      expect(getSignedUrl).toHaveBeenCalledWith(
        "customer/image.png",
        300,
        false,
      );
    });

    it("rejects objects outside a scoped prefix before storage access", async () => {
      const { integration, project } = await prepareIntegration({
        mediaPrefix: "allowed/",
      });

      await expect(
        testExternalMediaObject({
          prisma,
          projectId: project.id,
          integrationId: integration.id,
          uri: "s3://media-bucket/outside/image.png",
        }),
      ).rejects.toThrow(
        "The media object must be within the selected integration media prefix",
      );
      expect(StorageServiceFactory.getInstance).not.toHaveBeenCalled();
    });

    it("probes and signs any key in the bucket when the media prefix is null", async () => {
      const verifyObjectAccess = vi.fn().mockResolvedValue(undefined);
      const getSignedUrl = vi.fn().mockResolvedValue("https://signed.example");
      (StorageServiceFactory.getInstance as Mock).mockReturnValue({
        verifyObjectAccess,
        getSignedUrl,
      });
      const { integration, project } = await prepareIntegration({
        mediaPrefix: null,
      });

      const result = await testExternalMediaObject({
        prisma,
        projectId: project.id,
        integrationId: integration.id,
        uri: "s3://media-bucket/any/directory/image.png",
      });

      expect(result.signedUrl).toBe("https://signed.example");
      expect(verifyObjectAccess).toHaveBeenCalledWith(
        "any/directory/image.png",
      );
      expect(getSignedUrl).toHaveBeenCalledWith(
        "any/directory/image.png",
        300,
        false,
      );
    });

    it("probes and signs any key in the bucket when the media prefix is blank", async () => {
      const verifyObjectAccess = vi.fn().mockResolvedValue(undefined);
      const getSignedUrl = vi.fn().mockResolvedValue("https://signed.example");
      (StorageServiceFactory.getInstance as Mock).mockReturnValue({
        verifyObjectAccess,
        getSignedUrl,
      });
      const { integration, project } = await prepareIntegration({
        mediaPrefix: "   ",
      });

      await testExternalMediaObject({
        prisma,
        projectId: project.id,
        integrationId: integration.id,
        uri: "s3://media-bucket/any/directory/image.png",
      });

      expect(verifyObjectAccess).toHaveBeenCalledWith(
        "any/directory/image.png",
      );
    });
  });
});
