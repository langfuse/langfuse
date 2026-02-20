/** @jest-environment node */

import {
  makeZodVerifiedAPICall,
  makeAPICall,
} from "@/src/__tests__/test-utils";
import { prisma } from "@langfuse/shared/src/db";
import { z } from "zod/v4";
import { randomUUID } from "crypto";
import {
  createAndAddApiKeysToDb,
  createBasicAuthHeader,
} from "@langfuse/shared/src/server";
import { decrypt } from "@langfuse/shared/encryption";

// Schemas based on Fern schema definition
const BlobStorageIntegrationResponseSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  type: z.enum(["S3", "S3_COMPATIBLE", "AZURE_BLOB_STORAGE"]),
  bucketName: z.string(),
  endpoint: z.string().nullable(),
  region: z.string(),
  accessKeyId: z.string().nullable(),
  prefix: z.string(),
  exportFrequency: z.enum(["hourly", "daily", "weekly"]),
  enabled: z.boolean(),
  forcePathStyle: z.boolean(),
  fileType: z.enum(["JSON", "CSV", "JSONL"]),
  exportMode: z.enum(["FULL_HISTORY", "FROM_TODAY", "FROM_CUSTOM_DATE"]),
  exportStartDate: z.coerce.date().nullable(),
  nextSyncAt: z.coerce.date().nullable(),
  lastSyncAt: z.coerce.date().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

const BlobStorageIntegrationsResponseSchema = z.object({
  data: z.array(BlobStorageIntegrationResponseSchema),
});

const BlobStorageIntegrationDeletionResponseSchema = z.object({
  message: z.string(),
});

// Valid blob storage integration request payload
const validBlobStorageConfig = {
  projectId: "",
  type: "S3" as const,
  bucketName: "test-bucket",
  endpoint: null,
  region: "us-east-1",
  accessKeyId: "AKIA123456789",
  secretAccessKey: "secret123456789",
  prefix: "langfuse-exports/",
  exportFrequency: "daily" as const,
  enabled: true,
  forcePathStyle: false,
  fileType: "JSONL" as const,
  exportMode: "FULL_HISTORY" as const,
  exportStartDate: null,
};

describe("Blob Storage Integrations API", () => {
  // Test data
  let testOrgId: string;
  let testProject1Id: string;
  let testProject2Id: string;
  let testApiKey: string;
  let testApiSecretKey: string;
  let otherOrgId: string;
  let otherProjectId: string;

  beforeAll(async () => {
    // Create test organization
    const testOrg = await prisma.organization.create({
      data: {
        name: `Blob Storage Test Org ${randomUUID().substring(0, 8)}`,
        cloudConfig: { plan: "Team" },
      },
    });
    testOrgId = testOrg.id;

    // Create test projects
    const testProject1 = await prisma.project.create({
      data: {
        name: `Blob Storage Test Project 1 ${randomUUID().substring(0, 8)}`,
        orgId: testOrgId,
      },
    });
    testProject1Id = testProject1.id;

    const testProject2 = await prisma.project.create({
      data: {
        name: `Blob Storage Test Project 2 ${randomUUID().substring(0, 8)}`,
        orgId: testOrgId,
      },
    });
    testProject2Id = testProject2.id;

    // Create organization API key
    const orgApiKey = await createAndAddApiKeysToDb({
      prisma,
      entityId: testOrgId,
      scope: "ORGANIZATION",
      note: "Test API Key for Blob Storage API",
      predefinedKeys: {
        publicKey: `pk-lf-blob-${randomUUID().substring(0, 8)}`,
        secretKey: `sk-lf-blob-${randomUUID().substring(0, 8)}`,
      },
    });
    testApiKey = orgApiKey.publicKey;
    testApiSecretKey = orgApiKey.secretKey;

    // Create another organization for cross-org tests
    const otherOrg = await prisma.organization.create({
      data: {
        name: `Other Blob Storage Org ${randomUUID().substring(0, 8)}`,
        cloudConfig: { plan: "Team" },
      },
    });
    otherOrgId = otherOrg.id;

    const otherProject = await prisma.project.create({
      data: {
        name: `Other Blob Storage Project ${randomUUID().substring(0, 8)}`,
        orgId: otherOrgId,
      },
    });
    otherProjectId = otherProject.id;
  });

  afterAll(async () => {
    // Clean up test data
    await prisma.organization.delete({
      where: { id: testOrgId },
    });
    await prisma.organization.delete({
      where: { id: otherOrgId },
    });
  });

  describe("GET /api/public/integrations/blob-storage", () => {
    let testIntegrationId: string;

    beforeAll(async () => {
      // Create a test blob storage integration
      const integration = await prisma.blobStorageIntegration.create({
        data: {
          projectId: testProject1Id,
          type: "S3",
          bucketName: "test-bucket",
          region: "us-east-1",
          accessKeyId: "test-access-key",
          secretAccessKey: "encrypted-secret",
          prefix: "langfuse-exports/",
          exportFrequency: "daily",
          enabled: true,
          forcePathStyle: false,
          fileType: "JSONL",
          exportMode: "FULL_HISTORY",
        },
      });
      testIntegrationId = integration.projectId;
    });

    afterAll(async () => {
      // Clean up test integration
      await prisma.blobStorageIntegration.deleteMany({
        where: { projectId: testProject1Id },
      });
    });

    it("should get all blob storage integrations for the organization", async () => {
      const response = await makeZodVerifiedAPICall(
        BlobStorageIntegrationsResponseSchema,
        "GET",
        "/api/public/integrations/blob-storage",
        undefined,
        createBasicAuthHeader(testApiKey, testApiSecretKey),
        200,
      );

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBe(1);

      const integration = response.body.data.find(
        (i) => i.id === testIntegrationId,
      );
      expect(integration).toBeDefined();
      expect(integration?.projectId).toBe(testProject1Id);
      expect(integration?.type).toBe("S3");
      expect(integration?.bucketName).toBe("test-bucket");
      expect(integration?.accessKeyId).toBe("test-access-key");
      // Verify that secretAccessKey is not returned
      expect(integration).not.toHaveProperty("secretAccessKey");
    });

    it("should return 401 with invalid API key", async () => {
      const result = await makeAPICall(
        "GET",
        "/api/public/integrations/blob-storage",
        undefined,
        createBasicAuthHeader("invalid-key", "invalid-secret"),
      );
      expect(result.status).toBe(401);
    });

    it("should return 403 with project-scoped API key", async () => {
      // Create project API key
      const projectApiKey = await createAndAddApiKeysToDb({
        prisma,
        entityId: testProject1Id,
        scope: "PROJECT",
        note: "Project API Key",
        predefinedKeys: {
          publicKey: `pk-lf-proj-${randomUUID().substring(0, 8)}`,
          secretKey: `sk-lf-proj-${randomUUID().substring(0, 8)}`,
        },
      });

      const result = await makeAPICall(
        "GET",
        "/api/public/integrations/blob-storage",
        undefined,
        createBasicAuthHeader(projectApiKey.publicKey, projectApiKey.secretKey),
      );
      expect(result.status).toBe(403);
      expect(result.body.message).toContain(
        "Organization-scoped API key required",
      );

      // Clean up
      await prisma.apiKey.delete({ where: { id: projectApiKey.id } });
    });
  });

  describe("PUT /api/public/integrations/blob-storage", () => {
    afterEach(async () => {
      // Clean up any created integrations
      await prisma.blobStorageIntegration.deleteMany({
        where: {
          projectId: {
            in: [testProject1Id, testProject2Id],
          },
        },
      });
    });

    it("should create a new blob storage integration", async () => {
      const requestBody = {
        ...validBlobStorageConfig,
        projectId: testProject1Id,
      };

      const response = await makeZodVerifiedAPICall(
        BlobStorageIntegrationResponseSchema,
        "PUT",
        "/api/public/integrations/blob-storage",
        requestBody,
        createBasicAuthHeader(testApiKey, testApiSecretKey),
      );

      expect(response.status).toBe(200);
      expect(response.body.projectId).toBe(testProject1Id);
      expect(response.body.type).toBe("S3");
      expect(response.body.bucketName).toBe("test-bucket");
      expect(response.body.enabled).toBe(true);
      // Verify secretAccessKey is not returned
      expect(response.body).not.toHaveProperty("secretAccessKey");

      // Verify it was saved to database
      const savedIntegration = await prisma.blobStorageIntegration.findUnique({
        where: { projectId: testProject1Id },
      });
      expect(savedIntegration).toBeDefined();
      expect(savedIntegration?.bucketName).toBe("test-bucket");
    });

    it("should update an existing blob storage integration", async () => {
      // Create initial integration
      await prisma.blobStorageIntegration.create({
        data: {
          projectId: testProject1Id,
          type: "S3",
          bucketName: "old-bucket",
          region: "us-west-1",
          accessKeyId: "old-key",
          secretAccessKey: "old-secret",
          prefix: "old-prefix/",
          exportFrequency: "hourly",
          enabled: false,
          forcePathStyle: true,
          fileType: "JSON",
          exportMode: "FROM_TODAY",
        },
      });

      const updateBody = {
        ...validBlobStorageConfig,
        projectId: testProject1Id,
        bucketName: "updated-bucket",
        enabled: true,
        exportFrequency: "weekly" as const,
      };

      const response = await makeZodVerifiedAPICall(
        BlobStorageIntegrationResponseSchema,
        "PUT",
        "/api/public/integrations/blob-storage",
        updateBody,
        createBasicAuthHeader(testApiKey, testApiSecretKey),
        200,
      );

      expect(response.status).toBe(200);
      expect(response.body.bucketName).toBe("updated-bucket");
      expect(response.body.enabled).toBe(true);
      expect(response.body.exportFrequency).toBe("weekly");
    });

    it("should validate required fields", async () => {
      const invalidBody = {
        projectId: testProject1Id,
        type: "S3",
        // Missing bucketName
        region: "us-east-1",
      };

      const result = await makeAPICall(
        "PUT",
        "/api/public/integrations/blob-storage",
        invalidBody,
        createBasicAuthHeader(testApiKey, testApiSecretKey),
      );
      expect(result.status).toBe(400);
      expect(result.body.message).toContain("Invalid request data");
    });

    it("should validate enum values", async () => {
      const invalidBody = {
        ...validBlobStorageConfig,
        projectId: testProject1Id,
        type: "INVALID_TYPE",
      };

      const result = await makeAPICall(
        "PUT",
        "/api/public/integrations/blob-storage",
        invalidBody,
        createBasicAuthHeader(testApiKey, testApiSecretKey),
      );
      expect(result.status).toBe(400);
      expect(result.body.message).toContain("Invalid request data");
    });

    it("should validate prefix format", async () => {
      const invalidBody = {
        ...validBlobStorageConfig,
        projectId: testProject1Id,
        prefix: "invalid-prefix", // Should end with /
      };

      const result = await makeAPICall(
        "PUT",
        "/api/public/integrations/blob-storage",
        invalidBody,
        createBasicAuthHeader(testApiKey, testApiSecretKey),
      );
      expect(result.status).toBe(400);
      expect(result.body.error).toBeDefined();
    });

    it("should return 404 for non-existent project", async () => {
      const nonExistentProjectId = randomUUID();
      const requestBody = {
        ...validBlobStorageConfig,
        projectId: nonExistentProjectId,
      };

      const result = await makeAPICall(
        "PUT",
        "/api/public/integrations/blob-storage",
        requestBody,
        createBasicAuthHeader(testApiKey, testApiSecretKey),
      );
      expect(result.status).toBe(404);
      expect(result.body.message).toContain("Project not found");
    });

    it("should return 404 for project from different organization", async () => {
      const requestBody = {
        ...validBlobStorageConfig,
        projectId: otherProjectId,
      };

      const result = await makeAPICall(
        "PUT",
        "/api/public/integrations/blob-storage",
        requestBody,
        createBasicAuthHeader(testApiKey, testApiSecretKey),
      );
      expect(result.status).toBe(404);
      expect(result.body.message).toContain("Project not found");
    });

    it("should return 401 with invalid API key", async () => {
      const requestBody = {
        ...validBlobStorageConfig,
        projectId: testProject1Id,
      };

      const result = await makeAPICall(
        "PUT",
        "/api/public/integrations/blob-storage",
        requestBody,
        createBasicAuthHeader("invalid-key", "invalid-secret"),
      );
      expect(result.status).toBe(401);
    });

    it("should handle different blob storage types", async () => {
      const azureConfig = {
        ...validBlobStorageConfig,
        projectId: testProject1Id,
        type: "AZURE_BLOB_STORAGE" as const,
        endpoint: "https://myaccount.blob.core.windows.net",
      };

      const response = await makeZodVerifiedAPICall(
        BlobStorageIntegrationResponseSchema,
        "PUT",
        "/api/public/integrations/blob-storage",
        azureConfig,
        createBasicAuthHeader(testApiKey, testApiSecretKey),
        200,
      );

      expect(response.status).toBe(200);
      expect(response.body.type).toBe("AZURE_BLOB_STORAGE");
      expect(response.body.endpoint).toBe(
        "https://myaccount.blob.core.windows.net",
      );
    });

    it("should handle export modes with dates", async () => {
      const customDateConfig = {
        ...validBlobStorageConfig,
        projectId: testProject1Id,
        exportMode: "FROM_CUSTOM_DATE" as const,
        exportStartDate: "2024-01-01T00:00:00Z",
      };

      const response = await makeZodVerifiedAPICall(
        BlobStorageIntegrationResponseSchema,
        "PUT",
        "/api/public/integrations/blob-storage",
        customDateConfig,
        createBasicAuthHeader(testApiKey, testApiSecretKey),
        200,
      );

      expect(response.status).toBe(200);
      expect(response.body.exportMode).toBe("FROM_CUSTOM_DATE");
      expect(response.body.exportStartDate).toBeDefined();
    });

    it("should store secretAccessKey encrypted in database", async () => {
      const testSecretKey = "my-super-secret-key-12345";
      const requestBody = {
        ...validBlobStorageConfig,
        projectId: testProject1Id,
        secretAccessKey: testSecretKey,
      };

      const response = await makeZodVerifiedAPICall(
        BlobStorageIntegrationResponseSchema,
        "PUT",
        "/api/public/integrations/blob-storage",
        requestBody,
        createBasicAuthHeader(testApiKey, testApiSecretKey),
      );

      expect(response.status).toBe(200);

      // Query database directly to check how secretAccessKey is stored
      const savedIntegration = await prisma.blobStorageIntegration.findUnique({
        where: { projectId: testProject1Id },
      });

      expect(savedIntegration).toBeDefined();

      // Verify secretAccessKey is NOT stored in plaintext
      expect(savedIntegration?.secretAccessKey).not.toBe(testSecretKey);

      // Verify the encrypted value can be decrypted back to the original
      expect(decrypt(savedIntegration!.secretAccessKey!)).toBe(testSecretKey);
    });
  });

  describe("DELETE /api/public/integrations/blob-storage/{id}", () => {
    let testIntegrationId: string;

    beforeEach(async () => {
      // Create test integration
      const integration = await prisma.blobStorageIntegration.create({
        data: {
          projectId: testProject1Id,
          type: "S3",
          bucketName: "test-bucket",
          region: "us-east-1",
          accessKeyId: "test-key",
          secretAccessKey: "test-secret",
          prefix: "test/",
          exportFrequency: "daily",
          enabled: true,
          forcePathStyle: false,
          fileType: "JSONL",
          exportMode: "FULL_HISTORY",
        },
      });
      testIntegrationId = integration.projectId; // Based on current implementation, ID is projectId
    });

    afterEach(async () => {
      // Clean up
      await prisma.blobStorageIntegration.deleteMany({
        where: { projectId: testProject1Id },
      });
    });

    it("should delete a blob storage integration", async () => {
      const response = await makeZodVerifiedAPICall(
        BlobStorageIntegrationDeletionResponseSchema,
        "DELETE",
        `/api/public/integrations/blob-storage/${testIntegrationId}`,
        undefined,
        createBasicAuthHeader(testApiKey, testApiSecretKey),
        200,
      );

      expect(response.status).toBe(200);
      expect(response.body.message).toBeDefined();

      // Verify it was deleted from database
      const deletedIntegration = await prisma.blobStorageIntegration.findUnique(
        {
          where: { projectId: testIntegrationId },
        },
      );
      expect(deletedIntegration).toBeNull();
    });

    it("should return 404 for non-existent integration", async () => {
      const nonExistentId = randomUUID();
      const result = await makeAPICall(
        "DELETE",
        `/api/public/integrations/blob-storage/${nonExistentId}`,
        undefined,
        createBasicAuthHeader(testApiKey, testApiSecretKey),
      );
      expect(result.status).toBe(404);
    });

    it("should return 404 for integration from different organization", async () => {
      // Create integration in other org
      const otherOrgIntegration = await prisma.blobStorageIntegration.create({
        data: {
          projectId: otherProjectId,
          type: "S3",
          bucketName: "other-bucket",
          region: "us-east-1",
          accessKeyId: "other-key",
          secretAccessKey: "other-secret",
          prefix: "other/",
          exportFrequency: "daily",
          enabled: true,
          forcePathStyle: false,
          fileType: "JSONL",
          exportMode: "FULL_HISTORY",
        },
      });

      const result = await makeAPICall(
        "DELETE",
        `/api/public/integrations/blob-storage/${otherOrgIntegration.projectId}`,
        undefined,
        createBasicAuthHeader(testApiKey, testApiSecretKey),
      );
      expect(result.status).toBe(404);

      // Check config still exists
      const integrations = await prisma.blobStorageIntegration.findMany({
        where: { projectId: otherProjectId },
      });
      expect(integrations).toHaveLength(1);

      // Clean up
      await prisma.blobStorageIntegration.delete({
        where: { projectId: otherProjectId },
      });
    });

    it("should return 401 with invalid API key", async () => {
      const result = await makeAPICall(
        "DELETE",
        `/api/public/integrations/blob-storage/${testIntegrationId}`,
        undefined,
        createBasicAuthHeader("invalid-key", "invalid-secret"),
      );
      expect(result.status).toBe(401);
    });

    it("should return 403 with project-scoped API key", async () => {
      const projectApiKey = await createAndAddApiKeysToDb({
        prisma,
        entityId: testProject1Id,
        scope: "PROJECT",
        note: "Project API Key",
        predefinedKeys: {
          publicKey: `pk-lf-proj-del-${randomUUID().substring(0, 8)}`,
          secretKey: `sk-lf-proj-del-${randomUUID().substring(0, 8)}`,
        },
      });

      const result = await makeAPICall(
        "DELETE",
        `/api/public/integrations/blob-storage/${testIntegrationId}`,
        undefined,
        createBasicAuthHeader(projectApiKey.publicKey, projectApiKey.secretKey),
      );
      expect(result.status).toBe(403);

      // Clean up
      await prisma.apiKey.delete({ where: { id: projectApiKey.id } });
    });
  });

  describe("Method validation", () => {
    it("should return 405 for unsupported methods", async () => {
      const result = await makeAPICall(
        "PATCH",
        "/api/public/integrations/blob-storage",
        undefined,
        createBasicAuthHeader(testApiKey, testApiSecretKey),
      );
      expect(result.status).toBe(405);
      expect(result.body.message).toContain("Method not allowed");
    });
  });
});
