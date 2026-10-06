import { randomUUID } from "crypto";
import type { Mock } from "vitest";

import { encrypt } from "@langfuse/shared/encryption";
import { prisma } from "@langfuse/shared/src/db";
import {
  createOrgProjectAndApiKey,
  StorageServiceFactory,
} from "@langfuse/shared/src/server";

import { createExternalMediaStorageService } from "@/src/features/external-media-storage/server";

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

async function enableExternalMediaStorage(orgId: string) {
  await prisma.organization.update({
    where: { id: orgId },
    data: { featureFlagOrgDefaults: ["externalMediaStorage"] },
  });
}

async function prepareIntegration({
  bucketName = "media-bucket",
  enabled = true,
  prefix,
}: {
  bucketName?: string;
  enabled?: boolean;
  prefix: string | null;
}) {
  const { org, project } = await createOrgProjectAndApiKey();
  orgIds.push(org.id);
  await enableExternalMediaStorage(org.id);
  await prisma.externalMediaStorageIntegration.create({
    data: {
      projectId: project.id,
      type: "S3",
      bucketName,
      prefix,
      accessKeyId: `access-${randomUUID()}`,
      secretAccessKey: encrypt("test-secret-key"),
      region: "us-east-1",
      endpoint: null,
      forcePathStyle: false,
      enabled,
    },
  });
  return project;
}

describe("external media storage service", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
  });

  it("uses the organization default as the feature gate", async () => {
    const { org, project } = await createOrgProjectAndApiKey();
    orgIds.push(org.id);
    const service = createExternalMediaStorageService(prisma);

    await expect(service.isFeatureEnabled(project.id)).resolves.toBe(false);
    await expect(service.getConfiguration(project.id)).rejects.toThrow(
      "External media storage is not enabled for this organization",
    );

    await enableExternalMediaStorage(org.id);

    await expect(service.isFeatureEnabled(project.id)).resolves.toBe(true);
    await expect(service.getConfiguration(project.id)).resolves.toBeNull();
  });

  it("never returns the stored secret in configuration responses", async () => {
    const project = await prepareIntegration({ prefix: null });

    const configuration = await createExternalMediaStorageService(
      prisma,
    ).getConfiguration(project.id);

    expect(configuration).not.toHaveProperty("secretAccessKey");
    expect(configuration?.secretAccessKeyDisplay).not.toContain(
      "test-secret-key",
    );
  });

  it("clears S3-compatible endpoint settings when switching to Amazon S3", async () => {
    const project = await prepareIntegration({ prefix: null });
    await prisma.externalMediaStorageIntegration.update({
      where: { projectId: project.id },
      data: {
        type: "S3_COMPATIBLE",
        endpoint: "https://storage.example.com",
        forcePathStyle: true,
      },
    });

    await createExternalMediaStorageService(prisma).saveConfiguration({
      actor: { apiKeyId: "test-api-key", orgId: project.orgId },
      projectId: project.id,
      values: {
        type: "S3",
        bucketName: "media-bucket",
        endpoint: "https://stale.example.com",
        region: "us-east-1",
        accessKeyId: "access-key",
        secretAccessKey: "",
        prefix: "",
        enabled: true,
        forcePathStyle: true,
      },
    });

    await expect(
      prisma.externalMediaStorageIntegration.findUniqueOrThrow({
        where: { projectId: project.id },
        select: { endpoint: true, forcePathStyle: true },
      }),
    ).resolves.toEqual({ endpoint: null, forcePathStyle: false });
  });

  it("signs an object within the configured bucket and prefix", async () => {
    const getSignedUrl = vi.fn().mockResolvedValue("https://signed.example");
    (StorageServiceFactory.getInstance as Mock).mockReturnValue({
      getSignedUrl,
    });
    const project = await prepareIntegration({ prefix: "customer/" });

    const result = await createExternalMediaStorageService(prisma).resolveUrl({
      projectId: project.id,
      uri: "s3://media-bucket/customer/image.png",
    });

    expect(result.url).toBe("https://signed.example");
    expect(getSignedUrl).toHaveBeenCalledWith("customer/image.png", 300, false);
  });

  it("allows any object in the bucket when no prefix is configured", async () => {
    const getSignedUrl = vi.fn().mockResolvedValue("https://signed.example");
    (StorageServiceFactory.getInstance as Mock).mockReturnValue({
      getSignedUrl,
    });
    const project = await prepareIntegration({ prefix: null });

    await createExternalMediaStorageService(prisma).resolveUrl({
      projectId: project.id,
      uri: "s3://media-bucket/any/directory/image.png",
    });

    expect(getSignedUrl).toHaveBeenCalledWith(
      "any/directory/image.png",
      300,
      false,
    );
  });

  it.each([
    ["a sibling prefix", "s3://media-bucket/customer-other/image.png"],
    ["another bucket", "s3://other-bucket/customer/image.png"],
  ])("rejects %s", async (_case, uri) => {
    const project = await prepareIntegration({ prefix: "customer/" });

    await expect(
      createExternalMediaStorageService(prisma).resolveUrl({
        projectId: project.id,
        uri,
      }),
    ).rejects.toThrow("External media is not available");
    expect(StorageServiceFactory.getInstance).not.toHaveBeenCalled();
  });

  it("does not use a disabled integration", async () => {
    const project = await prepareIntegration({
      enabled: false,
      prefix: null,
    });

    await expect(
      createExternalMediaStorageService(prisma).resolveUrl({
        projectId: project.id,
        uri: "s3://media-bucket/image.png",
      }),
    ).rejects.toThrow("External media is not available");
    expect(StorageServiceFactory.getInstance).not.toHaveBeenCalled();
  });

  it("does not use another project's integration", async () => {
    const configuredProject = await prepareIntegration({ prefix: null });
    const { org, project: otherProject } = await createOrgProjectAndApiKey();
    orgIds.push(org.id);
    await enableExternalMediaStorage(org.id);

    await expect(
      createExternalMediaStorageService(prisma).resolveUrl({
        projectId: otherProject.id,
        uri: "s3://media-bucket/image.png",
      }),
    ).rejects.toThrow("External media is not available");
    expect(configuredProject.id).not.toBe(otherProject.id);
    expect(StorageServiceFactory.getInstance).not.toHaveBeenCalled();
  });
});
