import type { Mock } from "vitest";

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
}: {
  mediaPrefix: string | null;
  bucketName?: string;
}) => {
  const { org, project } = await createOrgProjectAndApiKey();
  orgIds.push(org.id);
  const integration = await prisma.blobStorageIntegration.create({
    data: {
      projectId: project.id,
      type: "S3",
      bucketName,
      region: "us-east-1",
      accessKeyId: "test-access-key",
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

    it("fails closed when two matching integrations are equally specific", async () => {
      const { project, integration } = await prepareIntegration({
        mediaPrefix: "customer/",
      });
      await prisma.blobStorageIntegration.create({
        data: {
          projectId: project.id,
          type: "S3",
          bucketName: integration.bucketName,
          region: "us-east-1",
          accessKeyId: "other-access-key",
          secretAccessKey: encrypt("other-secret-key"),
          prefix: "other-exports/",
          mediaPrefix: "customer/",
          mediaStorageEnabled: true,
          exportFrequency: "daily",
          enabled: true,
          forcePathStyle: false,
          fileType: "JSONL",
          exportMode: "FULL_HISTORY",
        },
      });

      await expect(
        resolveExternalMediaUrl({
          prisma,
          projectId: project.id,
          uri: "s3://media-bucket/customer/image.png",
        }),
      ).rejects.toThrow("External media is not available");
      expect(StorageServiceFactory.getInstance).not.toHaveBeenCalled();
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
  });
});
