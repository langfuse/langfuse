import dns from "node:dns/promises";
import { randomUUID } from "crypto";
import type { Mock } from "vitest";

import { InvalidRequestError } from "@langfuse/shared";
import { decrypt, encrypt } from "@langfuse/shared/encryption";
import { prisma } from "@langfuse/shared/src/db";
import {
  createOrgProjectAndApiKey,
  StorageServiceFactory,
} from "@langfuse/shared/src/server";
import { getCrossAccountRoleArn } from "@langfuse/shared/src/server/ee/storageRoleAuth/storageRoleCredentials";

import { createExternalMediaStorageService } from "@/src/ee/features/external-media-storage/server/service";

vi.mock("@langfuse/shared/src/server", async () => {
  const actual = await vi.importActual("@langfuse/shared/src/server");
  return {
    ...actual,
    StorageServiceFactory: {
      getInstance: vi.fn(),
    },
  };
});

vi.mock(
  "@langfuse/shared/src/server/ee/storageRoleAuth/storageRoleCredentials",
  async () => {
    const actual = await vi.importActual(
      "@langfuse/shared/src/server/ee/storageRoleAuth/storageRoleCredentials",
    );
    return {
      ...actual,
      getCrossAccountRoleArn: vi.fn().mockReturnValue(null),
    };
  },
);

const orgIds: string[] = [];

async function enableExternalMediaStorage(orgId: string) {
  await prisma.organization.update({
    where: { id: orgId },
    data: { cloudConfig: { plan: "Enterprise" } },
  });
}

async function prepareIntegration({
  bucketName = "media-bucket",
  prefix,
}: {
  bucketName?: string;
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
    },
  });
  return project;
}

describe("external media storage service", () => {
  afterEach(() => {
    vi.clearAllMocks();
    (getCrossAccountRoleArn as Mock).mockReturnValue(null);
  });

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
  });

  it("requires the enterprise entitlement", async () => {
    const { org, project } = await createOrgProjectAndApiKey();
    orgIds.push(org.id);
    const service = createExternalMediaStorageService(prisma);

    await expect(service.isFeatureEnabled(project.id)).resolves.toBe(false);
    await expect(service.getConfiguration(project.id)).rejects.toThrow(
      "External media storage is an Enterprise feature",
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
      canUseRoleAuth: false,
      values: {
        type: "S3",
        bucketName: "media-bucket",
        endpoint: "https://stale.example.com",
        region: "us-east-1",
        accessKeyId: "access-key",
        secretAccessKey: "new-secret-key",
        prefix: "",
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

  describe("stored secret reuse", () => {
    const savedValues = {
      type: "S3_COMPATIBLE" as const,
      bucketName: "media-bucket",
      endpoint: "https://storage.example.com",
      region: "us-east-1",
      accessKeyId: "access-key",
      secretAccessKey: "",
      prefix: "",
      forcePathStyle: true,
    };

    beforeEach(() => {
      vi.spyOn(dns, "resolve4").mockResolvedValue(["1.1.1.1"]);
      vi.spyOn(dns, "resolve6").mockRejectedValue(new Error("ENODATA"));
      vi.spyOn(dns, "lookup").mockResolvedValue([
        { address: "1.1.1.1", family: 4 },
      ] as never);
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    async function prepareS3CompatibleIntegration() {
      const project = await prepareIntegration({ prefix: null });
      await prisma.externalMediaStorageIntegration.update({
        where: { projectId: project.id },
        data: {
          type: savedValues.type,
          endpoint: savedValues.endpoint,
          accessKeyId: savedValues.accessKeyId,
          forcePathStyle: true,
        },
      });
      return project;
    }

    const findStored = (projectId: string) =>
      prisma.externalMediaStorageIntegration.findUniqueOrThrow({
        where: { projectId },
        select: {
          type: true,
          bucketName: true,
          endpoint: true,
          accessKeyId: true,
          secretAccessKey: true,
        },
      });

    it("keeps the stored secret when the destination is unchanged", async () => {
      const project = await prepareS3CompatibleIntegration();

      await createExternalMediaStorageService(prisma).saveConfiguration({
        actor: { apiKeyId: "test-api-key", orgId: project.orgId },
        projectId: project.id,
        canUseRoleAuth: false,
        values: { ...savedValues, prefix: "customer/" },
      });

      const stored = await findStored(project.id);
      expect(decrypt(stored.secretAccessKey!)).toBe("test-secret-key");
    });

    it.each([
      ["endpoint", { endpoint: "https://other-storage.example.com" }],
      ["bucket", { bucketName: "other-bucket" }],
      ["access key ID", { accessKeyId: "other-access-key" }],
      ["storage type", { type: "S3" as const, endpoint: null }],
    ])(
      "requires the secret again when the %s changes",
      async (_case, change) => {
        const project = await prepareS3CompatibleIntegration();
        const before = await findStored(project.id);

        const rejection = createExternalMediaStorageService(
          prisma,
        ).saveConfiguration({
          actor: { apiKeyId: "test-api-key", orgId: project.orgId },
          projectId: project.id,
          canUseRoleAuth: false,
          values: { ...savedValues, ...change },
        });
        await expect(rejection).rejects.toBeInstanceOf(InvalidRequestError);
        await expect(rejection).rejects.toThrow(
          "Secret Access Key is required when changing the storage provider, bucket, endpoint, or Access Key ID",
        );
        await expect(findStored(project.id)).resolves.toEqual(before);
      },
    );
  });

  it("signs an object within the configured bucket and prefix", async () => {
    const getSignedUrl = vi.fn().mockResolvedValue("https://signed.example");
    (StorageServiceFactory.getInstance as Mock).mockReturnValue({
      getSignedUrl,
      getObjectContentLength: vi.fn().mockResolvedValue(42),
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
      getObjectContentLength: vi.fn().mockResolvedValue(42),
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

  it("reports a stored endpoint that fails validation as an invalid request", async () => {
    const project = await prepareIntegration({ prefix: null });
    await prisma.externalMediaStorageIntegration.update({
      where: { projectId: project.id },
      data: { type: "S3_COMPATIBLE", endpoint: "https://127.0.0.1:9000" },
    });
    const service = createExternalMediaStorageService(prisma);

    for (const call of [service.testObject, service.resolveUrl]) {
      const rejection = call({
        projectId: project.id,
        uri: "s3://media-bucket/image.png",
      });
      await expect(rejection).rejects.toBeInstanceOf(InvalidRequestError);
      await expect(rejection).rejects.toThrow("Blocked IP address detected");
    }
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

  it("switches to IAM role auth with a stable, encrypted external ID", async () => {
    const project = await prepareIntegration({ prefix: "media/" });
    const service = createExternalMediaStorageService(prisma);
    const values = {
      type: "S3" as const,
      authType: "ROLE_ARN" as const,
      bucketName: "media-bucket",
      region: "eu-west-1",
      roleArn: "arn:aws:iam::123456789012:role/langfuse-media",
      prefix: "media/",
      forcePathStyle: false,
    };
    const save = (canUseRoleAuth = true) =>
      service.saveConfiguration({
        actor: { apiKeyId: "test-api-key", orgId: project.orgId },
        projectId: project.id,
        values,
        canUseRoleAuth,
      });

    await expect(save()).rejects.toThrow(
      "IAM role auth is not available on this Langfuse deployment",
    );

    (getCrossAccountRoleArn as Mock).mockReturnValue(
      "arn:aws:iam::210987654321:role/langfuse-cross-account",
    );
    await expect(save(false)).rejects.toThrow(
      "IAM role auth requires an Enterprise plan",
    );
    await save();
    const stored =
      await prisma.externalMediaStorageIntegration.findUniqueOrThrow({
        where: { projectId: project.id },
      });
    expect(stored).toMatchObject({
      authType: "ROLE_ARN",
      roleArn: values.roleArn,
      accessKeyId: null,
      secretAccessKey: null,
    });
    const externalId = decrypt(stored.externalId!);
    expect(externalId).toMatch(/^lf-[0-9a-f]{32}$/);

    await save();
    const configuration = await service.getConfiguration(project.id);
    expect(configuration).not.toHaveProperty("externalId");
    expect(configuration?.hasExternalId).toBe(true);
    await expect(service.getExternalId(project.id)).resolves.toBe(externalId);

    (StorageServiceFactory.getInstance as Mock).mockReturnValue({
      getSignedUrl: vi.fn().mockResolvedValue("https://signed.example"),
      getObjectContentLength: vi.fn().mockResolvedValue(42),
    });
    await service.resolveUrl({
      projectId: project.id,
      uri: "s3://media-bucket/media/image.png",
    });
    expect(StorageServiceFactory.getInstance).toHaveBeenCalledWith(
      expect.objectContaining({
        credentials: { type: "role", provider: expect.any(Function) },
      }),
    );
  });
});
