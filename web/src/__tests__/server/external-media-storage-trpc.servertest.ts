import dns from "node:dns/promises";
import { randomUUID } from "crypto";
import type { Mock } from "vitest";
import type { Session } from "next-auth";

import { testFeatureFlags } from "@/src/__tests__/fixtures/feature-flags";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import { encrypt } from "@langfuse/shared/encryption";
import { prisma, type Role } from "@langfuse/shared/src/db";
import { env as sharedEnv } from "@langfuse/shared/src/env";
import {
  createOrgProjectAndApiKey,
  StorageServiceFactory,
} from "@langfuse/shared/src/server";

vi.mock("@langfuse/shared/src/server", async () => {
  const actual = await vi.importActual("@langfuse/shared/src/server");
  return {
    ...actual,
    StorageServiceFactory: {
      getInstance: vi.fn(),
    },
  };
});

const __orgIds: string[] = [];

async function prepare({ projectRole = "ADMIN" }: { projectRole?: Role } = {}) {
  const { project, org } = await createOrgProjectAndApiKey();
  __orgIds.push(org.id);
  await prisma.organization.update({
    where: { id: org.id },
    data: { featureFlagOrgDefaults: ["externalMediaStorage"] },
  });

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
      featureFlags: testFeatureFlags(),
    },
    environment: {
      enableExperimentalFeatures: false,
      selfHostedInstancePlan: "cloud:hobby",
    },
  };

  const ctx = createInnerTRPCContext({ session, headers: {} });
  return { project, org, caller: appRouter.createCaller({ ...ctx, prisma }) };
}

async function createIntegration({
  projectId,
  prefix = "customer/",
}: {
  projectId: string;
  prefix?: string | null;
}) {
  return prisma.externalMediaStorageIntegration.create({
    data: {
      projectId,
      type: "S3",
      bucketName: `media-${randomUUID()}`,
      prefix,
      accessKeyId: "test-access-key",
      secretAccessKey: encrypt("test-secret-key"),
      region: "us-east-1",
      endpoint: null,
      forcePathStyle: false,
    },
  });
}

function mockStorage() {
  const getSignedUrl = vi.fn().mockResolvedValue("https://signed.example");
  (StorageServiceFactory.getInstance as Mock).mockReturnValue({
    getSignedUrl,
    getObjectContentLength: vi.fn().mockResolvedValue(42),
  });
  return { getSignedUrl };
}

const s3CompatibleInput = (projectId: string, endpoint: string) => ({
  projectId,
  type: "S3_COMPATIBLE" as const,
  bucketName: "media-bucket",
  endpoint,
  region: "us-east-1",
  accessKeyId: "test-access-key",
  secretAccessKey: "test-secret-key",
  prefix: "",
  forcePathStyle: true,
});

describe("externalMediaStorage tRPC", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: { in: __orgIds } } });
  });

  describe("update endpoint validation", () => {
    const original = {
      region: sharedEnv.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION,
      hosts:
        sharedEnv.LANGFUSE_EXTERNAL_MEDIA_STORAGE_ENDPOINT_WHITELISTED_HOST,
      ips: sharedEnv.LANGFUSE_EXTERNAL_MEDIA_STORAGE_ENDPOINT_WHITELISTED_IPS,
      ipSegments:
        sharedEnv.LANGFUSE_EXTERNAL_MEDIA_STORAGE_ENDPOINT_WHITELISTED_IP_SEGMENTS,
      allowedHosts:
        sharedEnv.LANGFUSE_EXTERNAL_MEDIA_STORAGE_ENDPOINT_ALLOWED_HOSTS,
    };

    beforeEach(() => {
      sharedEnv.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = undefined;
      sharedEnv.LANGFUSE_EXTERNAL_MEDIA_STORAGE_ENDPOINT_WHITELISTED_HOST = [];
      sharedEnv.LANGFUSE_EXTERNAL_MEDIA_STORAGE_ENDPOINT_WHITELISTED_IPS = [];
      sharedEnv.LANGFUSE_EXTERNAL_MEDIA_STORAGE_ENDPOINT_WHITELISTED_IP_SEGMENTS =
        [];
      sharedEnv.LANGFUSE_EXTERNAL_MEDIA_STORAGE_ENDPOINT_ALLOWED_HOSTS = [];
    });

    afterEach(() => {
      vi.restoreAllMocks();
      sharedEnv.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = original.region;
      sharedEnv.LANGFUSE_EXTERNAL_MEDIA_STORAGE_ENDPOINT_WHITELISTED_HOST =
        original.hosts;
      sharedEnv.LANGFUSE_EXTERNAL_MEDIA_STORAGE_ENDPOINT_WHITELISTED_IPS =
        original.ips;
      sharedEnv.LANGFUSE_EXTERNAL_MEDIA_STORAGE_ENDPOINT_WHITELISTED_IP_SEGMENTS =
        original.ipSegments;
      sharedEnv.LANGFUSE_EXTERNAL_MEDIA_STORAGE_ENDPOINT_ALLOWED_HOSTS =
        original.allowedHosts;
    });

    it.each([
      ["loopback IPv4", "http://127.0.0.1:9000", "Blocked IP address"],
      ["loopback IPv6", "http://[::1]:9000", "Blocked IP address"],
      ["cloud metadata", "http://169.254.169.254", "Blocked hostname"],
      ["RFC1918", "http://10.0.0.1:9000", "Blocked IP address"],
      [
        "embedded credentials",
        "https://user:pass@storage.example.com",
        "URL credentials are not allowed",
      ],
    ])(
      "rejects a %s endpoint without persisting it",
      async (_case, endpoint, message) => {
        const { project, caller } = await prepare();

        await expect(
          caller.externalMediaStorage.update(
            s3CompatibleInput(project.id, endpoint),
          ),
        ).rejects.toMatchObject({
          code: "BAD_REQUEST",
          message: expect.stringContaining(message),
        });
        await expect(
          prisma.externalMediaStorageIntegration.findUnique({
            where: { projectId: project.id },
          }),
        ).resolves.toBeNull();
      },
    );

    it("rejects a hostname that resolves to a private address", async () => {
      vi.spyOn(dns, "resolve4").mockResolvedValue(["10.0.0.5"]);
      vi.spyOn(dns, "resolve6").mockRejectedValue(new Error("ENODATA"));
      vi.spyOn(dns, "lookup").mockResolvedValue([
        { address: "10.0.0.5", family: 4 },
      ] as never);
      const { project, caller } = await prepare();

      await expect(
        caller.externalMediaStorage.update(
          s3CompatibleInput(project.id, "https://storage.internal.example.com"),
        ),
      ).rejects.toMatchObject({
        code: "BAD_REQUEST",
        message: expect.stringContaining("Blocked IP address"),
      });
      expect(dns.resolve4).toHaveBeenCalledWith("storage.internal.example.com");
      await expect(
        prisma.externalMediaStorageIntegration.findUnique({
          where: { projectId: project.id },
        }),
      ).resolves.toBeNull();
    });

    it("requires HTTPS and ignores the private-address exemptions on Langfuse Cloud", async () => {
      sharedEnv.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = "EU";
      sharedEnv.LANGFUSE_EXTERNAL_MEDIA_STORAGE_ENDPOINT_WHITELISTED_IPS = [
        "127.0.0.1",
      ];
      const { project, caller } = await prepare();

      await expect(
        caller.externalMediaStorage.update(
          s3CompatibleInput(project.id, "http://storage.example.com"),
        ),
      ).rejects.toMatchObject({
        code: "BAD_REQUEST",
        message: expect.stringContaining("Only HTTPS"),
      });
      await expect(
        caller.externalMediaStorage.update(
          s3CompatibleInput(project.id, "https://127.0.0.1:9000"),
        ),
      ).rejects.toMatchObject({
        code: "BAD_REQUEST",
        message: expect.stringContaining("Blocked IP address"),
      });
    });
  });

  describe("access control", () => {
    it("forbids a VIEWER from reading, saving, deleting, or testing the configuration", async () => {
      const { project, caller } = await prepare({ projectRole: "VIEWER" });
      const integration = await createIntegration({ projectId: project.id });

      await expect(
        caller.externalMediaStorage.get({ projectId: project.id }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(
        caller.externalMediaStorage.update(
          s3CompatibleInput(project.id, "https://storage.example.com"),
        ),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(
        caller.externalMediaStorage.delete({ projectId: project.id }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(
        caller.externalMediaStorage.testObject({
          projectId: project.id,
          uri: `s3://${integration.bucketName}/customer/image.png`,
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });

      await expect(
        prisma.externalMediaStorageIntegration.findUniqueOrThrow({
          where: { projectId: project.id },
          select: { type: true, endpoint: true },
        }),
      ).resolves.toEqual({ type: "S3", endpoint: null });
      expect(StorageServiceFactory.getInstance).not.toHaveBeenCalled();
    });
  });

  describe("media.resolveExternalMedia", () => {
    it("lets a VIEWER resolve an object within the configured prefix", async () => {
      const { getSignedUrl } = mockStorage();
      const { project, caller } = await prepare({ projectRole: "VIEWER" });
      const integration = await createIntegration({ projectId: project.id });

      await expect(
        caller.media.resolveExternalMedia({
          projectId: project.id,
          uri: `s3://${integration.bucketName}/customer/image.png`,
        }),
      ).resolves.toMatchObject({
        url: "https://signed.example",
        urlTtlSeconds: 300,
      });
      expect(getSignedUrl).toHaveBeenCalledWith(
        "customer/image.png",
        300,
        false,
      );
    });

    it.each([
      ["a key outside the prefix", "other/secret.png"],
      ["a sibling prefix", "customer-other/secret.png"],
    ])("does not sign %s for a VIEWER", async (_case, key) => {
      mockStorage();
      const { project, caller } = await prepare({ projectRole: "VIEWER" });
      const integration = await createIntegration({ projectId: project.id });

      await expect(
        caller.media.resolveExternalMedia({
          projectId: project.id,
          uri: `s3://${integration.bucketName}/${key}`,
        }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect(StorageServiceFactory.getInstance).not.toHaveBeenCalled();
    });

    it("does not resolve media through another tenant's project", async () => {
      mockStorage();
      const tenantA = await prepare();
      const tenantB = await prepare();
      const integrationA = await createIntegration({
        projectId: tenantA.project.id,
      });
      const uri = `s3://${integrationA.bucketName}/customer/image.png`;

      await expect(
        tenantB.caller.media.resolveExternalMedia({
          projectId: tenantA.project.id,
          uri,
        }),
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
      await expect(
        tenantB.caller.media.resolveExternalMedia({
          projectId: tenantB.project.id,
          uri,
        }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect(StorageServiceFactory.getInstance).not.toHaveBeenCalled();
    });
  });
});
