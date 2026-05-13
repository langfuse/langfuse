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
import { BLOB_EXPORT_FIELD_GROUPS } from "@langfuse/shared";
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
  exportFrequency: z.enum(["every_20_minutes", "hourly", "daily", "weekly"]),
  enabled: z.boolean(),
  forcePathStyle: z.boolean(),
  fileType: z.enum(["JSON", "CSV", "JSONL"]),
  exportMode: z.enum(["FULL_HISTORY", "FROM_TODAY", "FROM_CUSTOM_DATE"]),
  exportStartDate: z.coerce.date().nullable(),
  compressed: z.boolean(),
  exportSource: z.enum(["LEGACY", "ENRICHED", "LEGACY_AND_ENRICHED"]),
  exportFieldGroups: z.array(z.enum(BLOB_EXPORT_FIELD_GROUPS)).nullable(),
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
  let testApiKeyId: string;
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
    testApiKeyId = orgApiKey.id;

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

    it("should reject invalid Azure container names", async () => {
      const azureConfig = {
        ...validBlobStorageConfig,
        projectId: testProject1Id,
        type: "AZURE_BLOB_STORAGE" as const,
        endpoint: "https://myaccount.blob.core.windows.net",
        bucketName: "Feedback N8N Bot",
      };

      const result = await makeAPICall(
        "PUT",
        "/api/public/integrations/blob-storage",
        azureConfig,
        createBasicAuthHeader(testApiKey, testApiSecretKey),
      );
      expect(result.status).toBe(400);
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

    it("should create integration with compressed=true by default", async () => {
      const requestBody = {
        ...validBlobStorageConfig,
        projectId: testProject1Id,
      };
      // Do not pass compressed — should default to true

      const response = await makeZodVerifiedAPICall(
        BlobStorageIntegrationResponseSchema,
        "PUT",
        "/api/public/integrations/blob-storage",
        requestBody,
        createBasicAuthHeader(testApiKey, testApiSecretKey),
      );

      expect(response.status).toBe(200);
      expect(response.body.compressed).toBe(true);
    });

    it("should create integration with compressed=false when specified", async () => {
      const requestBody = {
        ...validBlobStorageConfig,
        projectId: testProject1Id,
        compressed: false,
      };

      const response = await makeZodVerifiedAPICall(
        BlobStorageIntegrationResponseSchema,
        "PUT",
        "/api/public/integrations/blob-storage",
        requestBody,
        createBasicAuthHeader(testApiKey, testApiSecretKey),
      );

      expect(response.status).toBe(200);
      expect(response.body.compressed).toBe(false);

      const savedIntegration = await prisma.blobStorageIntegration.findUnique({
        where: { projectId: testProject1Id },
      });
      expect(savedIntegration?.compressed).toBe(false);
    });

    it("should store all exportFieldGroups by default when creating via REST", async () => {
      const requestBody = {
        ...validBlobStorageConfig,
        projectId: testProject1Id,
      };

      await makeZodVerifiedAPICall(
        BlobStorageIntegrationResponseSchema,
        "PUT",
        "/api/public/integrations/blob-storage",
        requestBody,
        createBasicAuthHeader(testApiKey, testApiSecretKey),
      );

      const saved = await prisma.blobStorageIntegration.findUnique({
        where: { projectId: testProject1Id },
      });
      expect(saved?.exportFieldGroups).toHaveLength(11);
    });

    it("should preserve exportFieldGroups in DB when updating via REST", async () => {
      // Seed a row with a custom subset
      await prisma.blobStorageIntegration.create({
        data: {
          projectId: testProject1Id,
          type: "S3",
          bucketName: "initial-bucket",
          region: "us-east-1",
          accessKeyId: "key",
          secretAccessKey: "secret",
          prefix: "",
          exportFrequency: "daily",
          enabled: true,
          forcePathStyle: false,
          fileType: "JSONL",
          exportMode: "FULL_HISTORY",
          exportFieldGroups: ["core", "io"],
        },
      });

      // Update via REST — exportFieldGroups is not part of the REST API schema
      await makeZodVerifiedAPICall(
        BlobStorageIntegrationResponseSchema,
        "PUT",
        "/api/public/integrations/blob-storage",
        {
          ...validBlobStorageConfig,
          projectId: testProject1Id,
          bucketName: "updated-bucket",
        },
        createBasicAuthHeader(testApiKey, testApiSecretKey),
      );

      const saved = await prisma.blobStorageIntegration.findUnique({
        where: { projectId: testProject1Id },
      });
      expect(saved?.exportFieldGroups).toStrictEqual(["core", "io"]);
    });
  });

  describe("PUT/GET exportSource + exportFieldGroups behavior", () => {
    afterEach(async () => {
      await prisma.blobStorageIntegration.deleteMany({
        where: {
          projectId: { in: [testProject1Id, testProject2Id] },
        },
      });
    });

    // ---- ENRICHED / LEGACY_AND_ENRICHED path ----

    it("ENRICHED + exportFieldGroups=[core,io] -> 200 and GET returns same value", async () => {
      const requestBody = {
        ...validBlobStorageConfig,
        projectId: testProject1Id,
        exportSource: "ENRICHED" as const,
        exportFieldGroups: ["core", "io"],
      };

      const putResponse = await makeZodVerifiedAPICall(
        BlobStorageIntegrationResponseSchema,
        "PUT",
        "/api/public/integrations/blob-storage",
        requestBody,
        createBasicAuthHeader(testApiKey, testApiSecretKey),
      );
      expect(putResponse.status).toBe(200);
      expect(putResponse.body.exportSource).toBe("ENRICHED");
      expect(putResponse.body.exportFieldGroups).toStrictEqual(["core", "io"]);

      const getResponse = await makeZodVerifiedAPICall(
        z.object({ data: z.array(BlobStorageIntegrationResponseSchema) }),
        "GET",
        "/api/public/integrations/blob-storage",
        undefined,
        createBasicAuthHeader(testApiKey, testApiSecretKey),
        200,
      );
      const integration = getResponse.body.data.find(
        (i) => i.projectId === testProject1Id,
      );
      expect(integration).toBeDefined();
      expect(integration?.exportSource).toBe("ENRICHED");
      expect(integration?.exportFieldGroups).toStrictEqual(["core", "io"]);
    });

    it("ENRICHED + exportFieldGroups=[io] (missing core) -> 400", async () => {
      const requestBody = {
        ...validBlobStorageConfig,
        projectId: testProject1Id,
        exportSource: "ENRICHED" as const,
        exportFieldGroups: ["io"],
      };

      const result = await makeAPICall(
        "PUT",
        "/api/public/integrations/blob-storage",
        requestBody,
        createBasicAuthHeader(testApiKey, testApiSecretKey),
      );
      expect(result.status).toBe(400);
    });

    it("ENRICHED + exportFieldGroups omitted -> 200 and GET returns all 11 groups", async () => {
      const requestBody = {
        ...validBlobStorageConfig,
        projectId: testProject1Id,
        exportSource: "ENRICHED" as const,
      };

      const putResponse = await makeZodVerifiedAPICall(
        BlobStorageIntegrationResponseSchema,
        "PUT",
        "/api/public/integrations/blob-storage",
        requestBody,
        createBasicAuthHeader(testApiKey, testApiSecretKey),
      );
      expect(putResponse.status).toBe(200);

      const getResponse = await makeZodVerifiedAPICall(
        z.object({ data: z.array(BlobStorageIntegrationResponseSchema) }),
        "GET",
        "/api/public/integrations/blob-storage",
        undefined,
        createBasicAuthHeader(testApiKey, testApiSecretKey),
        200,
      );
      const integration = getResponse.body.data.find(
        (i) => i.projectId === testProject1Id,
      );
      expect(integration).toBeDefined();
      expect(integration?.exportSource).toBe("ENRICHED");
      expect(integration?.exportFieldGroups).toBeDefined();
      expect(integration?.exportFieldGroups).toHaveLength(
        BLOB_EXPORT_FIELD_GROUPS.length,
      );
      expect(new Set(integration?.exportFieldGroups)).toStrictEqual(
        new Set(BLOB_EXPORT_FIELD_GROUPS),
      );
    });

    it("ENRICHED + exportFieldGroups=null -> 200 and GET returns all 11 groups", async () => {
      const requestBody = {
        ...validBlobStorageConfig,
        projectId: testProject1Id,
        exportSource: "ENRICHED" as const,
        exportFieldGroups: null,
      };

      const putResponse = await makeZodVerifiedAPICall(
        BlobStorageIntegrationResponseSchema,
        "PUT",
        "/api/public/integrations/blob-storage",
        requestBody,
        createBasicAuthHeader(testApiKey, testApiSecretKey),
      );
      expect(putResponse.status).toBe(200);

      const getResponse = await makeZodVerifiedAPICall(
        z.object({ data: z.array(BlobStorageIntegrationResponseSchema) }),
        "GET",
        "/api/public/integrations/blob-storage",
        undefined,
        createBasicAuthHeader(testApiKey, testApiSecretKey),
        200,
      );
      const integration = getResponse.body.data.find(
        (i) => i.projectId === testProject1Id,
      );
      expect(integration).toBeDefined();
      expect(integration?.exportFieldGroups).toBeDefined();
      expect(integration?.exportFieldGroups).toHaveLength(
        BLOB_EXPORT_FIELD_GROUPS.length,
      );
      expect(new Set(integration?.exportFieldGroups)).toStrictEqual(
        new Set(BLOB_EXPORT_FIELD_GROUPS),
      );
    });

    // ---- LEGACY path ----

    it("LEGACY + exportFieldGroups omitted -> 200; GET hides field groups", async () => {
      const requestBody = {
        ...validBlobStorageConfig,
        projectId: testProject1Id,
        exportSource: "LEGACY" as const,
      };

      const putResponse = await makeZodVerifiedAPICall(
        BlobStorageIntegrationResponseSchema,
        "PUT",
        "/api/public/integrations/blob-storage",
        requestBody,
        createBasicAuthHeader(testApiKey, testApiSecretKey),
      );
      expect(putResponse.status).toBe(200);

      const getResponse = await makeZodVerifiedAPICall(
        z.object({ data: z.array(BlobStorageIntegrationResponseSchema) }),
        "GET",
        "/api/public/integrations/blob-storage",
        undefined,
        createBasicAuthHeader(testApiKey, testApiSecretKey),
        200,
      );
      const integration = getResponse.body.data.find(
        (i) => i.projectId === testProject1Id,
      );
      expect(integration).toBeDefined();
      expect(integration?.exportSource).toBe("LEGACY");
      expect(integration?.exportFieldGroups).toBeNull();
    });

    it("LEGACY + exportFieldGroups=null -> 200; GET hides field groups", async () => {
      const requestBody = {
        ...validBlobStorageConfig,
        projectId: testProject1Id,
        exportSource: "LEGACY" as const,
        exportFieldGroups: null,
      };

      const putResponse = await makeZodVerifiedAPICall(
        BlobStorageIntegrationResponseSchema,
        "PUT",
        "/api/public/integrations/blob-storage",
        requestBody,
        createBasicAuthHeader(testApiKey, testApiSecretKey),
      );
      expect(putResponse.status).toBe(200);

      const getResponse = await makeZodVerifiedAPICall(
        z.object({ data: z.array(BlobStorageIntegrationResponseSchema) }),
        "GET",
        "/api/public/integrations/blob-storage",
        undefined,
        createBasicAuthHeader(testApiKey, testApiSecretKey),
        200,
      );
      const integration = getResponse.body.data.find(
        (i) => i.projectId === testProject1Id,
      );
      expect(integration).toBeDefined();
      expect(integration?.exportFieldGroups).toBeNull();
    });

    it("LEGACY + exportFieldGroups=[] -> 400 with 'not applicable'", async () => {
      const requestBody = {
        ...validBlobStorageConfig,
        projectId: testProject1Id,
        exportSource: "LEGACY" as const,
        exportFieldGroups: [],
      };

      const result = await makeAPICall(
        "PUT",
        "/api/public/integrations/blob-storage",
        requestBody,
        createBasicAuthHeader(testApiKey, testApiSecretKey),
      );
      expect(result.status).toBe(400);
      const message = JSON.stringify(result.body);
      expect(message.toLowerCase()).toContain("not applicable");
    });

    it("LEGACY + exportFieldGroups=[core,io] -> 400 with 'not applicable'", async () => {
      const requestBody = {
        ...validBlobStorageConfig,
        projectId: testProject1Id,
        exportSource: "LEGACY" as const,
        exportFieldGroups: ["core", "io"],
      };

      const result = await makeAPICall(
        "PUT",
        "/api/public/integrations/blob-storage",
        requestBody,
        createBasicAuthHeader(testApiKey, testApiSecretKey),
      );
      expect(result.status).toBe(400);
      const message = JSON.stringify(result.body);
      expect(message.toLowerCase()).toContain("not applicable");
    });

    it("GET hides exportFieldGroups for legacy LEGACY rows seeded via Prisma", async () => {
      await prisma.blobStorageIntegration.create({
        data: {
          projectId: testProject1Id,
          type: "S3",
          bucketName: "legacy-bucket",
          region: "us-east-1",
          accessKeyId: "key",
          secretAccessKey: "secret",
          prefix: "",
          exportFrequency: "daily",
          enabled: true,
          forcePathStyle: false,
          fileType: "JSONL",
          exportMode: "FULL_HISTORY",
          exportSource: "TRACES_OBSERVATIONS",
          exportFieldGroups: ["core", "io", "metadata"],
        },
      });

      const getResponse = await makeZodVerifiedAPICall(
        z.object({ data: z.array(BlobStorageIntegrationResponseSchema) }),
        "GET",
        "/api/public/integrations/blob-storage",
        undefined,
        createBasicAuthHeader(testApiKey, testApiSecretKey),
        200,
      );

      const integration = getResponse.body.data.find(
        (i) => i.projectId === testProject1Id,
      );
      expect(integration).toBeDefined();
      expect(integration?.exportSource).toBe("LEGACY");
      expect(integration?.exportFieldGroups).toBeNull();
    });

    it("PUT LEGACY preserves existing export_field_groups column in DB", async () => {
      // Seed with a custom subset
      await prisma.blobStorageIntegration.create({
        data: {
          projectId: testProject1Id,
          type: "S3",
          bucketName: "initial-bucket",
          region: "us-east-1",
          accessKeyId: "key",
          secretAccessKey: "secret",
          prefix: "",
          exportFrequency: "daily",
          enabled: true,
          forcePathStyle: false,
          fileType: "JSONL",
          exportMode: "FULL_HISTORY",
          exportSource: "TRACES_OBSERVATIONS",
          exportFieldGroups: ["core", "io"],
        },
      });

      await makeZodVerifiedAPICall(
        BlobStorageIntegrationResponseSchema,
        "PUT",
        "/api/public/integrations/blob-storage",
        {
          ...validBlobStorageConfig,
          projectId: testProject1Id,
          exportSource: "LEGACY" as const,
          bucketName: "updated-bucket",
        },
        createBasicAuthHeader(testApiKey, testApiSecretKey),
      );

      const saved = await prisma.blobStorageIntegration.findUnique({
        where: { projectId: testProject1Id },
      });
      expect(saved?.bucketName).toBe("updated-bucket");
      // REST never overwrites export_field_groups for this source.
      expect(saved?.exportFieldGroups).toStrictEqual(["core", "io"]);
    });

    // ---- Response shape ----

    it("PUT response includes exportSource and exportFieldGroups (null for LEGACY)", async () => {
      const requestBody = {
        ...validBlobStorageConfig,
        projectId: testProject1Id,
        exportSource: "LEGACY" as const,
      };

      const response = await makeZodVerifiedAPICall(
        BlobStorageIntegrationResponseSchema,
        "PUT",
        "/api/public/integrations/blob-storage",
        requestBody,
        createBasicAuthHeader(testApiKey, testApiSecretKey),
      );
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("exportSource", "LEGACY");
      expect(response.body).toHaveProperty("exportFieldGroups");
      expect(response.body.exportFieldGroups).toBeNull();
    });

    it("GET response includes exportSource always and exportFieldGroups with source-conditional null", async () => {
      // Seed two integrations on different projects with different sources
      await prisma.blobStorageIntegration.create({
        data: {
          projectId: testProject1Id,
          type: "S3",
          bucketName: "bucket-1",
          region: "us-east-1",
          accessKeyId: "key",
          secretAccessKey: "secret",
          prefix: "",
          exportFrequency: "daily",
          enabled: true,
          forcePathStyle: false,
          fileType: "JSONL",
          exportMode: "FULL_HISTORY",
          exportSource: "TRACES_OBSERVATIONS",
          exportFieldGroups: ["core", "io", "metadata"],
        },
      });
      await prisma.blobStorageIntegration.create({
        data: {
          projectId: testProject2Id,
          type: "S3",
          bucketName: "bucket-2",
          region: "us-east-1",
          accessKeyId: "key",
          secretAccessKey: "secret",
          prefix: "",
          exportFrequency: "daily",
          enabled: true,
          forcePathStyle: false,
          fileType: "JSONL",
          exportMode: "FULL_HISTORY",
          exportSource: "EVENTS",
          exportFieldGroups: ["core", "io"],
        },
      });

      const getResponse = await makeZodVerifiedAPICall(
        z.object({ data: z.array(BlobStorageIntegrationResponseSchema) }),
        "GET",
        "/api/public/integrations/blob-storage",
        undefined,
        createBasicAuthHeader(testApiKey, testApiSecretKey),
        200,
      );

      const legacyIntegration = getResponse.body.data.find(
        (i) => i.projectId === testProject1Id,
      );
      const enrichedIntegration = getResponse.body.data.find(
        (i) => i.projectId === testProject2Id,
      );
      expect(legacyIntegration?.exportSource).toBe("LEGACY");
      expect(legacyIntegration?.exportFieldGroups).toBeNull();
      expect(enrichedIntegration?.exportSource).toBe("ENRICHED");
      expect(enrichedIntegration?.exportFieldGroups).toStrictEqual([
        "core",
        "io",
      ]);
    });

    it("GET response maps internal TRACES_OBSERVATIONS_EVENTS to public LEGACY_AND_ENRICHED", async () => {
      // Seed via Prisma with the third internal enum value to exercise the
      // mapping for LEGACY_AND_ENRICHED through the public REST surface.
      // satisfies-enforced exhaustiveness in INTERNAL_TO_PUBLIC_EXPORT_SOURCE
      // catches a missing key at compile time, but only a runtime assertion
      // catches a copy-paste regression (e.g. "ENRICHED" written twice).
      await prisma.blobStorageIntegration.create({
        data: {
          projectId: testProject1Id,
          type: "S3",
          bucketName: "bucket-mixed",
          region: "us-east-1",
          accessKeyId: "key",
          secretAccessKey: "secret",
          prefix: "",
          exportFrequency: "daily",
          enabled: true,
          forcePathStyle: false,
          fileType: "JSONL",
          exportMode: "FULL_HISTORY",
          exportSource: "TRACES_OBSERVATIONS_EVENTS",
          exportFieldGroups: ["core", "io", "metadata"],
        },
      });

      const getResponse = await makeZodVerifiedAPICall(
        z.object({ data: z.array(BlobStorageIntegrationResponseSchema) }),
        "GET",
        "/api/public/integrations/blob-storage",
        undefined,
        createBasicAuthHeader(testApiKey, testApiSecretKey),
        200,
      );

      const integration = getResponse.body.data.find(
        (i) => i.projectId === testProject1Id,
      );
      expect(integration).toBeDefined();
      expect(integration?.exportSource).toBe("LEGACY_AND_ENRICHED");
      // exportFieldGroups is only masked to null for LEGACY — the
      // LEGACY_AND_ENRICHED source returns the raw DB array.
      expect(integration?.exportFieldGroups).toStrictEqual([
        "core",
        "io",
        "metadata",
      ]);
    });

    it("PUT without exportSource preserves existing ENRICHED source and field groups", async () => {
      // Pre-seed an ENRICHED row with a custom field-group subset
      await prisma.blobStorageIntegration.create({
        data: {
          projectId: testProject1Id,
          type: "S3",
          bucketName: "initial-bucket",
          region: "us-east-1",
          accessKeyId: "key",
          secretAccessKey: "secret",
          prefix: "",
          exportFrequency: "daily",
          enabled: true,
          forcePathStyle: false,
          fileType: "JSONL",
          exportMode: "FULL_HISTORY",
          exportSource: "EVENTS",
          exportFieldGroups: ["core", "io"],
        },
      });

      // PUT update with exportSource and exportFieldGroups both omitted
      const requestBody = {
        ...validBlobStorageConfig,
        projectId: testProject1Id,
        bucketName: "updated-bucket",
      };
      const putResponse = await makeZodVerifiedAPICall(
        BlobStorageIntegrationResponseSchema,
        "PUT",
        "/api/public/integrations/blob-storage",
        requestBody,
        createBasicAuthHeader(testApiKey, testApiSecretKey),
      );
      expect(putResponse.status).toBe(200);
      expect(putResponse.body.exportSource).toBe("ENRICHED");
      expect(putResponse.body.exportFieldGroups).toStrictEqual(["core", "io"]);

      // DB row preserved on both columns; bucket updated
      const saved = await prisma.blobStorageIntegration.findUnique({
        where: { projectId: testProject1Id },
      });
      expect(saved?.exportSource).toBe("EVENTS");
      expect(saved?.exportFieldGroups).toStrictEqual(["core", "io"]);
      expect(saved?.bucketName).toBe("updated-bucket");
    });

    it("PUT exportSource=null preserves existing ENRICHED source and field groups", async () => {
      // Pre-seed an ENRICHED row with a custom field-group subset
      await prisma.blobStorageIntegration.create({
        data: {
          projectId: testProject1Id,
          type: "S3",
          bucketName: "initial-bucket",
          region: "us-east-1",
          accessKeyId: "key",
          secretAccessKey: "secret",
          prefix: "",
          exportFrequency: "daily",
          enabled: true,
          forcePathStyle: false,
          fileType: "JSONL",
          exportMode: "FULL_HISTORY",
          exportSource: "EVENTS",
          exportFieldGroups: ["core", "io"],
        },
      });

      // PUT with exportSource explicitly null — mirrors what an OpenAPI/SDK
      // client would emit for a not-provided value
      const requestBody = {
        ...validBlobStorageConfig,
        projectId: testProject1Id,
        exportSource: null,
        bucketName: "updated-bucket",
      };
      const putResponse = await makeZodVerifiedAPICall(
        BlobStorageIntegrationResponseSchema,
        "PUT",
        "/api/public/integrations/blob-storage",
        requestBody,
        createBasicAuthHeader(testApiKey, testApiSecretKey),
      );
      expect(putResponse.status).toBe(200);
      expect(putResponse.body.exportSource).toBe("ENRICHED");
      expect(putResponse.body.exportFieldGroups).toStrictEqual(["core", "io"]);

      const saved = await prisma.blobStorageIntegration.findUnique({
        where: { projectId: testProject1Id },
      });
      expect(saved?.exportSource).toBe("EVENTS");
      expect(saved?.exportFieldGroups).toStrictEqual(["core", "io"]);
    });

    it("PUT exportSource=ENRICHED without exportFieldGroups on existing ENRICHED row preserves field groups", async () => {
      // Pre-seed an ENRICHED row with a custom field-group subset
      await prisma.blobStorageIntegration.create({
        data: {
          projectId: testProject1Id,
          type: "S3",
          bucketName: "initial-bucket",
          region: "us-east-1",
          accessKeyId: "key",
          secretAccessKey: "secret",
          prefix: "",
          exportFrequency: "daily",
          enabled: true,
          forcePathStyle: false,
          fileType: "JSONL",
          exportMode: "FULL_HISTORY",
          exportSource: "EVENTS",
          exportFieldGroups: ["core", "io"],
        },
      });

      // PUT with explicit exportSource=ENRICHED but exportFieldGroups omitted
      const requestBody = {
        ...validBlobStorageConfig,
        projectId: testProject1Id,
        exportSource: "ENRICHED" as const,
        bucketName: "updated-bucket",
      };
      const putResponse = await makeZodVerifiedAPICall(
        BlobStorageIntegrationResponseSchema,
        "PUT",
        "/api/public/integrations/blob-storage",
        requestBody,
        createBasicAuthHeader(testApiKey, testApiSecretKey),
      );
      expect(putResponse.status).toBe(200);
      expect(putResponse.body.exportSource).toBe("ENRICHED");
      expect(putResponse.body.exportFieldGroups).toStrictEqual(["core", "io"]);

      const saved = await prisma.blobStorageIntegration.findUnique({
        where: { projectId: testProject1Id },
      });
      expect(saved?.exportFieldGroups).toStrictEqual(["core", "io"]);
      expect(saved?.bucketName).toBe("updated-bucket");
    });

    it("PUT with exportFieldGroups but no exportSource -> 400", async () => {
      const requestBody = {
        ...validBlobStorageConfig,
        projectId: testProject1Id,
        exportFieldGroups: ["core", "io"],
      };

      const result = await makeAPICall(
        "PUT",
        "/api/public/integrations/blob-storage",
        requestBody,
        createBasicAuthHeader(testApiKey, testApiSecretKey),
      );
      expect(result.status).toBe(400);
      const message = JSON.stringify(result.body).toLowerCase();
      expect(message).toContain("exportsource is required");
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

    it("should create an audit log entry for delete", async () => {
      const auditLogWhere = {
        resourceType: "blobStorageIntegration",
        resourceId: testIntegrationId,
        action: "delete",
        orgId: testOrgId,
        projectId: testIntegrationId,
        apiKeyId: testApiKeyId,
      };
      const auditLogCountBefore = await prisma.auditLog.count({
        where: auditLogWhere,
      });

      await makeZodVerifiedAPICall(
        BlobStorageIntegrationDeletionResponseSchema,
        "DELETE",
        `/api/public/integrations/blob-storage/${testIntegrationId}`,
        undefined,
        createBasicAuthHeader(testApiKey, testApiSecretKey),
        200,
      );

      const auditLogCountAfter = await prisma.auditLog.count({
        where: auditLogWhere,
      });
      expect(auditLogCountAfter).toBe(auditLogCountBefore + 1);
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
