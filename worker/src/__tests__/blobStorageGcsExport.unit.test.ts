import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// Every StorageServiceFactory.getInstance call, so we can assert the GCS
// export is built keyless against the GCS client. Hoisted for the module mock.
const factoryCalls = vi.hoisted(() => [] as any[]);
const uploadCalls = vi.hoisted(() => [] as any[]);

vi.mock("@langfuse/shared/src/db", () => ({
  prisma: {
    blobStorageIntegration: {
      findUnique: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    project: { findUnique: vi.fn().mockResolvedValue({ name: "p" }) },
  },
}));

vi.mock("@langfuse/shared/src/server", async (importOriginal) => {
  const mod =
    await importOriginal<typeof import("@langfuse/shared/src/server")>();
  async function* empty(): AsyncGenerator<Record<string, unknown>> {
    // no rows
  }
  return {
    ...mod,
    StorageServiceFactory: {
      getInstance: (params: any) => {
        factoryCalls.push(params);
        return {
          uploadFileBuffered: vi.fn(async (p: any) => {
            uploadCalls.push(p);
            for await (const _chunk of p.data) void _chunk;
            return undefined;
          }),
          uploadFile: vi.fn(async () => undefined),
        };
      },
    },
    getTracesForBlobStorageExport: () => empty(),
    getObservationsForBlobStorageExport: () => empty(),
    getScoresForBlobStorageExport: () => empty(),
    getEventsForBlobStorageExport: () => empty(),
    createModelCache: () => ({ getModel: async () => null }),
    blobStorageEndpointConnectionValidationOptions: () => undefined,
  };
});

import { createRequire } from "node:module";
import { prisma } from "@langfuse/shared/src/db";
import { encrypt } from "@langfuse/shared/encryption";
import { handleBlobStorageIntegrationProjectJob } from "../features/blobstorage/handleBlobStorageIntegrationProjectJob";
import type { Job } from "bullmq";

// The compiled @langfuse/shared reads its env through Node's require cache, a
// different instance from an ESM import of "@langfuse/shared/src/env", so
// mutate the one the allowlist helper actually sees.
const sharedEnv = createRequire(import.meta.url)("@langfuse/shared/src/env")
  .env as {
  LANGFUSE_BLOB_STORAGE_GCS_ALLOWED_BUCKETS: string[];
  NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: string | undefined;
};

const makeJob = (): Job<any> =>
  ({
    id: "job-1",
    attemptsMade: 0,
    data: { id: "payload-1", payload: { projectId: "project-1" } },
  }) as unknown as Job<any>;

const gcsRow = (bucketName: string, secretAccessKey: string | null = null) => ({
  projectId: "project-1",
  type: "GOOGLE_CLOUD_STORAGE",
  bucketName,
  prefix: "",
  accessKeyId: null,
  secretAccessKey,
  region: "auto",
  endpoint: null,
  forcePathStyle: false,
  enabled: true,
  exportFrequency: "daily",
  fileType: "CSV",
  exportMode: "FROM_CUSTOM_DATE",
  exportStartDate: new Date(Date.now() - 2 * 60 * 60 * 1000),
  exportSource: "TRACES_OBSERVATIONS",
  exportFieldGroups: ["core"],
  compressed: false,
  lastSyncAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
  createdAt: new Date("2026-01-01T00:00:00Z"),
  exportTuning: null,
});

describe("handleBlobStorageIntegrationProjectJob — GOOGLE_CLOUD_STORAGE", () => {
  const original = {
    buckets: sharedEnv.LANGFUSE_BLOB_STORAGE_GCS_ALLOWED_BUCKETS,
    region: sharedEnv.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION,
  };

  beforeEach(() => {
    factoryCalls.length = 0;
    uploadCalls.length = 0;
    vi.clearAllMocks();
    sharedEnv.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = undefined;
    sharedEnv.LANGFUSE_BLOB_STORAGE_GCS_ALLOWED_BUCKETS = ["allowed-bucket"];
    (prisma.blobStorageIntegration.findUnique as any).mockResolvedValue(
      gcsRow("allowed-bucket"),
    );
  });

  afterEach(() => {
    sharedEnv.LANGFUSE_BLOB_STORAGE_GCS_ALLOWED_BUCKETS = original.buckets;
    sharedEnv.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = original.region;
  });

  it("exports through the keyless GCS client for an allowlisted bucket", async () => {
    await handleBlobStorageIntegrationProjectJob(makeJob());

    expect(factoryCalls).toHaveLength(1);
    expect(factoryCalls[0]).toMatchObject({
      bucketName: "allowed-bucket",
      useGoogleCloudStorage: true,
      useAzureBlob: false,
      accessKeyId: undefined,
      secretAccessKey: undefined,
      googleCloudCredentials: undefined,
    });
    expect(uploadCalls.length).toBeGreaterThan(0);
  });

  it("disables the export once the bucket is removed from the allowlist", async () => {
    sharedEnv.LANGFUSE_BLOB_STORAGE_GCS_ALLOWED_BUCKETS = ["some-other-bucket"];

    await handleBlobStorageIntegrationProjectJob(makeJob());

    // A config fault: nothing is written and the integration is disabled
    // rather than retried.
    expect(factoryCalls).toHaveLength(0);
    expect(uploadCalls).toHaveLength(0);
    expect(prisma.blobStorageIntegration.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          lastError: expect.stringContaining(
            "LANGFUSE_BLOB_STORAGE_GCS_ALLOWED_BUCKETS",
          ),
        }),
      }),
    );
    expect(prisma.blobStorageIntegration.updateMany).toHaveBeenCalledWith({
      where: { projectId: "project-1", enabled: true },
      data: { enabled: false },
    });
  });

  it("exports with a stored service account key, bypassing the allowlist", async () => {
    const key = JSON.stringify({ type: "service_account", project_id: "p" });
    sharedEnv.LANGFUSE_BLOB_STORAGE_GCS_ALLOWED_BUCKETS = [];
    (prisma.blobStorageIntegration.findUnique as any).mockResolvedValue(
      gcsRow("customer-bucket", encrypt(key)),
    );

    await handleBlobStorageIntegrationProjectJob(makeJob());

    expect(factoryCalls).toHaveLength(1);
    expect(factoryCalls[0]).toMatchObject({
      bucketName: "customer-bucket",
      useGoogleCloudStorage: true,
      googleCloudCredentials: key,
      accessKeyId: undefined,
      secretAccessKey: undefined,
    });
    expect(uploadCalls.length).toBeGreaterThan(0);
  });

  it("never reads a non-JSON stored secret as a key file path", async () => {
    (prisma.blobStorageIntegration.findUnique as any).mockResolvedValue(
      gcsRow("customer-bucket", encrypt("/var/run/secrets/key.json")),
    );

    await expect(
      handleBlobStorageIntegrationProjectJob(makeJob()),
    ).rejects.toThrow(/service account JSON key/);
    expect(factoryCalls).toHaveLength(0);
    expect(uploadCalls).toHaveLength(0);
  });
});
