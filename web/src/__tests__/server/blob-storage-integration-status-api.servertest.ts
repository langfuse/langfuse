import {
  makeZodVerifiedAPICall,
  makeAPICall,
} from "@/src/__tests__/test-utils";
import { prisma } from "@langfuse/shared/src/db";
import { z } from "zod";
import { randomUUID } from "crypto";
import {
  createAndAddApiKeysToDb,
  createBasicAuthHeader,
} from "@langfuse/shared/src/server";

const BlobStorageIntegrationStatusResponseSchema = z
  .object({
    id: z.string(),
    projectId: z.string(),
    syncStatus: z.enum(["idle", "queued", "up_to_date", "disabled", "error"]),
    enabled: z.boolean(),
    lastSyncAt: z.coerce.date().nullable(),
    nextSyncAt: z.coerce.date().nullable(),
    lastError: z.string().nullable(),
    lastErrorAt: z.coerce.date().nullable(),
  })
  .strict();

// Stable reference timestamps for table tests
const NOW = Date.now();
const HOUR_AGO = new Date(NOW - 60 * 60 * 1000);
const TWO_HOURS_AGO = new Date(NOW - 2 * 60 * 60 * 1000);
const THIRTY_MIN_AGO = new Date(NOW - 30 * 60 * 1000);
const TEN_MIN_AGO = new Date(NOW - 10 * 60 * 1000);
const TOMORROW = new Date(NOW + 24 * 60 * 60 * 1000);

describe("Blob Storage Integration Status API - GET /api/public/integrations/blob-storage/{id}", () => {
  let testOrgId: string;
  let testProjectId: string;
  let testApiKey: string;
  let testApiSecretKey: string;
  let otherOrgId: string;
  let otherProjectId: string;

  beforeAll(async () => {
    const testOrg = await prisma.organization.create({
      data: {
        name: `Blob Status Test Org ${randomUUID().substring(0, 8)}`,
        cloudConfig: { plan: "Team" },
      },
    });
    testOrgId = testOrg.id;

    const testProject = await prisma.project.create({
      data: {
        name: `Blob Status Test Project ${randomUUID().substring(0, 8)}`,
        orgId: testOrgId,
      },
    });
    testProjectId = testProject.id;

    const orgApiKey = await createAndAddApiKeysToDb({
      prisma,
      entityId: testOrgId,
      scope: "ORGANIZATION",
      note: "Test API Key for Blob Status API",
      predefinedKeys: {
        publicKey: `pk-lf-bstat-${randomUUID().substring(0, 8)}`,
        secretKey: `sk-lf-bstat-${randomUUID().substring(0, 8)}`,
      },
    });
    testApiKey = orgApiKey.publicKey;
    testApiSecretKey = orgApiKey.secretKey;

    const otherOrg = await prisma.organization.create({
      data: {
        name: `Other Blob Status Org ${randomUUID().substring(0, 8)}`,
        cloudConfig: { plan: "Team" },
      },
    });
    otherOrgId = otherOrg.id;

    const otherProject = await prisma.project.create({
      data: {
        name: `Other Blob Status Project ${randomUUID().substring(0, 8)}`,
        orgId: otherOrgId,
      },
    });
    otherProjectId = otherProject.id;
  });

  afterAll(async () => {
    await prisma.organization.delete({ where: { id: testOrgId } });
    await prisma.organization.delete({ where: { id: otherOrgId } });
  });

  afterEach(async () => {
    await prisma.blobStorageIntegration.deleteMany({
      where: { projectId: { in: [testProjectId, otherProjectId] } },
    });
  });

  // --- Auth & 404 tests (unique setup, not table-friendly) ---

  it("should return 401 with invalid API key", async () => {
    const result = await makeAPICall(
      "GET",
      `/api/public/integrations/blob-storage/${testProjectId}`,
      undefined,
      createBasicAuthHeader("invalid-key", "invalid-secret"),
    );
    expect(result.status).toBe(401);
  });

  it("should return 403 with project-scoped API key", async () => {
    const projectApiKey = await createAndAddApiKeysToDb({
      prisma,
      entityId: testProjectId,
      scope: "PROJECT",
      note: "Project API Key for status test",
      predefinedKeys: {
        publicKey: `pk-lf-pstat-${randomUUID().substring(0, 8)}`,
        secretKey: `sk-lf-pstat-${randomUUID().substring(0, 8)}`,
      },
    });

    const result = await makeAPICall(
      "GET",
      `/api/public/integrations/blob-storage/${testProjectId}`,
      undefined,
      createBasicAuthHeader(projectApiKey.publicKey, projectApiKey.secretKey),
    );
    expect(result.status).toBe(403);

    await prisma.apiKey.delete({ where: { id: projectApiKey.id } });
  });

  it("should return 404 when no integration exists", async () => {
    const result = await makeAPICall(
      "GET",
      `/api/public/integrations/blob-storage/${testProjectId}`,
      undefined,
      createBasicAuthHeader(testApiKey, testApiSecretKey),
    );
    expect(result.status).toBe(404);
  });

  it("should return 404 for integration from different organization", async () => {
    await prisma.blobStorageIntegration.create({
      data: {
        projectId: otherProjectId,
        type: "S3",
        bucketName: "other-bucket",
        region: "us-east-1",
        accessKeyId: "other-key",
        secretAccessKey: "other-secret",
        prefix: "",
        exportFrequency: "daily",
        enabled: true,
        forcePathStyle: false,
        fileType: "JSONL",
        exportMode: "FULL_HISTORY",
      },
    });

    const result = await makeAPICall(
      "GET",
      `/api/public/integrations/blob-storage/${otherProjectId}`,
      undefined,
      createBasicAuthHeader(testApiKey, testApiSecretKey),
    );
    expect(result.status).toBe(404);
  });

  // --- syncStatus derivation (table-driven) ---

  it.each<{
    name: string;
    enabled: boolean;
    lastSyncAt: Date | null;
    nextSyncAt: Date | null;
    lastError: string | null;
    lastErrorAt: Date | null;
    expectedStatus: string;
    expectedFields?: Record<string, unknown>;
  }>([
    {
      name: "disabled (basic)",
      enabled: false,
      lastSyncAt: null,
      nextSyncAt: null,
      lastError: null,
      lastErrorAt: null,
      expectedStatus: "disabled",
      expectedFields: { enabled: false },
    },
    {
      name: "idle (enabled, never synced)",
      enabled: true,
      lastSyncAt: null,
      nextSyncAt: null,
      lastError: null,
      lastErrorAt: null,
      expectedStatus: "idle",
      expectedFields: { enabled: true, lastSyncAt: null },
    },
    {
      name: "up_to_date (nextSyncAt in future)",
      enabled: true,
      lastSyncAt: HOUR_AGO,
      nextSyncAt: TOMORROW,
      lastError: null,
      lastErrorAt: null,
      expectedStatus: "up_to_date",
      expectedFields: { lastError: null, lastErrorAt: null },
    },
    {
      // Edge case: lastSyncAt set but nextSyncAt null (data inconsistency).
      // Worker always sets both, but defensive test documents the fallthrough.
      name: "up_to_date (lastSyncAt set, nextSyncAt null — data inconsistency)",
      enabled: true,
      lastSyncAt: HOUR_AGO,
      nextSyncAt: null,
      lastError: null,
      lastErrorAt: null,
      expectedStatus: "up_to_date",
    },
    {
      name: "queued (nextSyncAt in past)",
      enabled: true,
      lastSyncAt: TWO_HOURS_AGO,
      nextSyncAt: THIRTY_MIN_AGO,
      lastError: null,
      lastErrorAt: null,
      expectedStatus: "queued",
    },
    {
      name: "error (lastError set, nextSyncAt in past)",
      enabled: true,
      lastSyncAt: HOUR_AGO,
      nextSyncAt: HOUR_AGO,
      lastError: "Access Denied",
      lastErrorAt: THIRTY_MIN_AGO,
      expectedStatus: "error",
      expectedFields: { lastError: "Access Denied" },
    },
    {
      name: "disabled > error (precedence: disabled wins over lastError)",
      enabled: false,
      lastSyncAt: HOUR_AGO,
      nextSyncAt: THIRTY_MIN_AGO,
      lastError: "Access Denied",
      lastErrorAt: THIRTY_MIN_AGO,
      expectedStatus: "disabled",
      expectedFields: { lastError: "Access Denied" },
    },
    {
      name: "error > up_to_date (precedence: lastError wins over future nextSyncAt)",
      enabled: true,
      lastSyncAt: HOUR_AGO,
      nextSyncAt: TOMORROW,
      lastError: "The bucket does not exist",
      lastErrorAt: TEN_MIN_AGO,
      expectedStatus: "error",
      expectedFields: { lastError: "The bucket does not exist" },
    },
  ])(
    "should return '$expectedStatus' when $name",
    async ({
      enabled,
      lastSyncAt,
      nextSyncAt,
      lastError,
      lastErrorAt,
      expectedStatus,
      expectedFields,
    }) => {
      await prisma.blobStorageIntegration.create({
        data: {
          projectId: testProjectId,
          type: "S3",
          bucketName: "test-bucket",
          region: "us-east-1",
          accessKeyId: "test-key",
          secretAccessKey: "test-secret",
          prefix: "",
          exportFrequency: "daily",
          enabled,
          forcePathStyle: false,
          fileType: "JSONL",
          exportMode: "FULL_HISTORY",
          lastSyncAt,
          nextSyncAt,
          lastError,
          lastErrorAt,
        },
      });

      const response = await makeZodVerifiedAPICall(
        BlobStorageIntegrationStatusResponseSchema,
        "GET",
        `/api/public/integrations/blob-storage/${testProjectId}`,
        undefined,
        createBasicAuthHeader(testApiKey, testApiSecretKey),
        200,
      );

      expect(response.status).toBe(200);
      expect(response.body.syncStatus).toBe(expectedStatus);
      if (expectedFields) {
        expect(response.body).toMatchObject(expectedFields);
      }
    },
  );

  // --- lastErrorAt exact value assertion ---

  it("should return exact lastErrorAt timestamp", async () => {
    const errorDate = new Date(Date.now() - 30 * 60 * 1000);

    await prisma.blobStorageIntegration.create({
      data: {
        projectId: testProjectId,
        type: "S3",
        bucketName: "test-bucket",
        region: "us-east-1",
        accessKeyId: "test-key",
        secretAccessKey: "test-secret",
        prefix: "",
        exportFrequency: "hourly",
        enabled: true,
        forcePathStyle: false,
        fileType: "JSONL",
        exportMode: "FULL_HISTORY",
        lastSyncAt: HOUR_AGO,
        nextSyncAt: HOUR_AGO,
        lastError: "Access Denied",
        lastErrorAt: errorDate,
      },
    });

    const response = await makeZodVerifiedAPICall(
      BlobStorageIntegrationStatusResponseSchema,
      "GET",
      `/api/public/integrations/blob-storage/${testProjectId}`,
      undefined,
      createBasicAuthHeader(testApiKey, testApiSecretKey),
      200,
    );

    expect(new Date(response.body.lastErrorAt).getTime()).toBe(
      errorDate.getTime(),
    );
  });

  // --- Error clearing (multi-step, not table-friendly) ---

  it("should clear error fields when lastError is set back to null (simulates successful sync)", async () => {
    const errorDate = new Date(Date.now() - 60 * 60 * 1000);

    await prisma.blobStorageIntegration.create({
      data: {
        projectId: testProjectId,
        type: "S3",
        bucketName: "test-bucket",
        region: "us-east-1",
        accessKeyId: "test-key",
        secretAccessKey: "test-secret",
        prefix: "",
        exportFrequency: "daily",
        enabled: true,
        forcePathStyle: false,
        fileType: "JSONL",
        exportMode: "FULL_HISTORY",
        lastSyncAt: errorDate,
        nextSyncAt: errorDate,
        lastError: "Access Denied",
        lastErrorAt: errorDate,
      },
    });

    // Verify it's in error state
    const errorResponse = await makeZodVerifiedAPICall(
      BlobStorageIntegrationStatusResponseSchema,
      "GET",
      `/api/public/integrations/blob-storage/${testProjectId}`,
      undefined,
      createBasicAuthHeader(testApiKey, testApiSecretKey),
      200,
    );
    expect(errorResponse.body.syncStatus).toBe("error");

    // Simulate successful sync: clear error, advance timestamps
    const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await prisma.blobStorageIntegration.update({
      where: { projectId: testProjectId },
      data: {
        lastSyncAt: new Date(),
        nextSyncAt: futureDate,
        lastError: null,
        lastErrorAt: null,
      },
    });

    // Verify error is cleared and status is now up_to_date
    const clearedResponse = await makeZodVerifiedAPICall(
      BlobStorageIntegrationStatusResponseSchema,
      "GET",
      `/api/public/integrations/blob-storage/${testProjectId}`,
      undefined,
      createBasicAuthHeader(testApiKey, testApiSecretKey),
      200,
    );
    expect(clearedResponse.body.syncStatus).toBe("up_to_date");
    expect(clearedResponse.body.lastError).toBeNull();
    expect(clearedResponse.body.lastErrorAt).toBeNull();
  });
});
