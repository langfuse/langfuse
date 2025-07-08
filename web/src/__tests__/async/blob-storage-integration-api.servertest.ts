import { makeZodVerifiedAPICall } from "@/src/__tests__/test-utils";
import { createOrgProjectAndApiKey } from "@/src/__tests__/test-utils";
import {
  BlobStorageIntegrationV1Response,
  type PostBlobStorageIntegrationV1Body,
  type PutBlobStorageIntegrationV1Body,
} from "@/src/features/public-api/types/blob-storage-integration";
import {
  BlobStorageIntegrationType,
  BlobStorageIntegrationFileType,
} from "@langfuse/shared";

describe("/api/public/integrations/blob-storage API Endpoints", () => {
  let auth: string;
  let projectId: string;

  beforeEach(async () => {
    const { auth: newAuth, projectId: newProjectId } =
      await createOrgProjectAndApiKey();
    auth = newAuth;
    projectId = newProjectId;
  });

  describe("GET /api/public/integrations/blob-storage", () => {
    it("should return 404 when no integration exists", async () => {
      const response = await makeZodVerifiedAPICall(
        BlobStorageIntegrationV1Response,
        "GET",
        "/api/public/integrations/blob-storage",
        undefined,
        auth,
      );

      expect(response.status).toBe(404);
    });

    it("should return the integration when it exists", async () => {
      // First create an integration
      const createBody: PostBlobStorageIntegrationV1Body = {
        type: BlobStorageIntegrationType.S3,
        bucketName: "test-bucket",
        region: "us-east-1",
        accessKeyId: "AKIAIOSFODNN7EXAMPLE",
        secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
        prefix: "test/",
        exportFrequency: "daily",
        enabled: true,
        forcePathStyle: false,
        fileType: BlobStorageIntegrationFileType.JSONL,
      };

      await makeZodVerifiedAPICall(
        BlobStorageIntegrationV1Response,
        "POST",
        "/api/public/integrations/blob-storage",
        createBody,
        auth,
      );

      // Now get the integration
      const getResponse = await makeZodVerifiedAPICall(
        BlobStorageIntegrationV1Response,
        "GET",
        "/api/public/integrations/blob-storage",
        undefined,
        auth,
      );

      expect(getResponse.status).toBe(200);
      expect(getResponse.body).toMatchObject({
        projectId,
        type: BlobStorageIntegrationType.S3,
        bucketName: "test-bucket",
        region: "us-east-1",
        accessKeyId: "AKIAIOSFODNN7EXAMPLE",
        prefix: "test/",
        exportFrequency: "daily",
        enabled: true,
        forcePathStyle: false,
        fileType: BlobStorageIntegrationFileType.JSONL,
      });
      expect(getResponse.body.createdAt).toBeTruthy();
      expect(getResponse.body.updatedAt).toBeTruthy();
      // Ensure secretAccessKey is not returned
      expect(getResponse.body).not.toHaveProperty("secretAccessKey");
    });
  });

  describe("POST /api/public/integrations/blob-storage", () => {
    it("should create a new blob storage integration", async () => {
      const createBody: PostBlobStorageIntegrationV1Body = {
        type: BlobStorageIntegrationType.S3,
        bucketName: "test-bucket",
        region: "us-east-1",
        accessKeyId: "AKIAIOSFODNN7EXAMPLE",
        secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
        prefix: "test/",
        exportFrequency: "daily",
        enabled: true,
        forcePathStyle: false,
        fileType: BlobStorageIntegrationFileType.JSONL,
      };

      const response = await makeZodVerifiedAPICall(
        BlobStorageIntegrationV1Response,
        "POST",
        "/api/public/integrations/blob-storage",
        createBody,
        auth,
      );

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        projectId,
        type: BlobStorageIntegrationType.S3,
        bucketName: "test-bucket",
        region: "us-east-1",
        accessKeyId: "AKIAIOSFODNN7EXAMPLE",
        prefix: "test/",
        exportFrequency: "daily",
        enabled: true,
        forcePathStyle: false,
        fileType: BlobStorageIntegrationFileType.JSONL,
      });
      expect(response.body.createdAt).toBeTruthy();
      expect(response.body.updatedAt).toBeTruthy();
      // Ensure secretAccessKey is not returned
      expect(response.body).not.toHaveProperty("secretAccessKey");
    });

    it("should create integration with minimal required fields", async () => {
      const createBody: PostBlobStorageIntegrationV1Body = {
        type: BlobStorageIntegrationType.S3,
        bucketName: "minimal-bucket",
        accessKeyId: "AKIAIOSFODNN7EXAMPLE",
        secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
      };

      const response = await makeZodVerifiedAPICall(
        BlobStorageIntegrationV1Response,
        "POST",
        "/api/public/integrations/blob-storage",
        createBody,
        auth,
      );

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        projectId,
        type: BlobStorageIntegrationType.S3,
        bucketName: "minimal-bucket",
        region: "auto", // default value
        accessKeyId: "AKIAIOSFODNN7EXAMPLE",
        prefix: "", // default value
        exportFrequency: "daily", // default value
        enabled: true, // default value
        forcePathStyle: false, // default value
        fileType: BlobStorageIntegrationFileType.JSONL, // default value
      });
    });

    it("should fail when integration already exists", async () => {
      const createBody: PostBlobStorageIntegrationV1Body = {
        type: BlobStorageIntegrationType.S3,
        bucketName: "test-bucket",
        region: "us-east-1",
        accessKeyId: "AKIAIOSFODNN7EXAMPLE",
        secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
      };

      // Create first integration
      await makeZodVerifiedAPICall(
        BlobStorageIntegrationV1Response,
        "POST",
        "/api/public/integrations/blob-storage",
        createBody,
        auth,
      );

      // Try to create second integration should fail
      const response = await makeZodVerifiedAPICall(
        BlobStorageIntegrationV1Response,
        "POST",
        "/api/public/integrations/blob-storage",
        createBody,
        auth,
      );

      expect(response.status).toBe(404);
    });

    it("should fail with invalid prefix", async () => {
      const createBody: PostBlobStorageIntegrationV1Body = {
        type: BlobStorageIntegrationType.S3,
        bucketName: "test-bucket",
        accessKeyId: "AKIAIOSFODNN7EXAMPLE",
        secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
        prefix: "invalid-prefix", // should end with /
      };

      const response = await makeZodVerifiedAPICall(
        BlobStorageIntegrationV1Response,
        "POST",
        "/api/public/integrations/blob-storage",
        createBody,
        auth,
      );

      expect(response.status).toBe(422);
    });

    it("should fail without required fields", async () => {
      const createBody = {
        type: BlobStorageIntegrationType.S3,
        // Missing bucketName
        accessKeyId: "AKIAIOSFODNN7EXAMPLE",
        secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
      };

      const response = await makeZodVerifiedAPICall(
        BlobStorageIntegrationV1Response,
        "POST",
        "/api/public/integrations/blob-storage",
        createBody,
        auth,
      );

      expect(response.status).toBe(422);
    });
  });

  describe("PUT /api/public/integrations/blob-storage", () => {
    beforeEach(async () => {
      // Create an integration before each test
      const createBody: PostBlobStorageIntegrationV1Body = {
        type: BlobStorageIntegrationType.S3,
        bucketName: "test-bucket",
        region: "us-east-1",
        accessKeyId: "AKIAIOSFODNN7EXAMPLE",
        secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
        prefix: "test/",
        exportFrequency: "daily",
        enabled: true,
        forcePathStyle: false,
        fileType: BlobStorageIntegrationFileType.JSONL,
      };

      await makeZodVerifiedAPICall(
        BlobStorageIntegrationV1Response,
        "POST",
        "/api/public/integrations/blob-storage",
        createBody,
        auth,
      );
    });

    it("should update an existing integration", async () => {
      const updateBody: PutBlobStorageIntegrationV1Body = {
        bucketName: "updated-bucket",
        region: "us-west-2",
        exportFrequency: "weekly",
        enabled: false,
      };

      const response = await makeZodVerifiedAPICall(
        BlobStorageIntegrationV1Response,
        "PUT",
        "/api/public/integrations/blob-storage",
        updateBody,
        auth,
      );

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        projectId,
        type: BlobStorageIntegrationType.S3, // unchanged
        bucketName: "updated-bucket", // updated
        region: "us-west-2", // updated
        accessKeyId: "AKIAIOSFODNN7EXAMPLE", // unchanged
        prefix: "test/", // unchanged
        exportFrequency: "weekly", // updated
        enabled: false, // updated
        forcePathStyle: false, // unchanged
        fileType: BlobStorageIntegrationFileType.JSONL, // unchanged
      });
    });

    it("should update only specified fields", async () => {
      const updateBody: PutBlobStorageIntegrationV1Body = {
        enabled: false,
      };

      const response = await makeZodVerifiedAPICall(
        BlobStorageIntegrationV1Response,
        "PUT",
        "/api/public/integrations/blob-storage",
        updateBody,
        auth,
      );

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        projectId,
        type: BlobStorageIntegrationType.S3, // unchanged
        bucketName: "test-bucket", // unchanged
        region: "us-east-1", // unchanged
        accessKeyId: "AKIAIOSFODNN7EXAMPLE", // unchanged
        prefix: "test/", // unchanged
        exportFrequency: "daily", // unchanged
        enabled: false, // updated
        forcePathStyle: false, // unchanged
        fileType: BlobStorageIntegrationFileType.JSONL, // unchanged
      });
    });

    it("should fail when integration doesn't exist", async () => {
      // Delete the integration first
      await makeZodVerifiedAPICall(
        BlobStorageIntegrationV1Response,
        "DELETE",
        "/api/public/integrations/blob-storage",
        undefined,
        auth,
      );

      const updateBody: PutBlobStorageIntegrationV1Body = {
        enabled: false,
      };

      const response = await makeZodVerifiedAPICall(
        BlobStorageIntegrationV1Response,
        "PUT",
        "/api/public/integrations/blob-storage",
        updateBody,
        auth,
      );

      expect(response.status).toBe(404);
    });
  });

  describe("DELETE /api/public/integrations/blob-storage", () => {
    beforeEach(async () => {
      // Create an integration before each test
      const createBody: PostBlobStorageIntegrationV1Body = {
        type: BlobStorageIntegrationType.S3,
        bucketName: "test-bucket",
        region: "us-east-1",
        accessKeyId: "AKIAIOSFODNN7EXAMPLE",
        secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
        prefix: "test/",
        exportFrequency: "daily",
        enabled: true,
        forcePathStyle: false,
        fileType: BlobStorageIntegrationFileType.JSONL,
      };

      await makeZodVerifiedAPICall(
        BlobStorageIntegrationV1Response,
        "POST",
        "/api/public/integrations/blob-storage",
        createBody,
        auth,
      );
    });

    it("should delete an existing integration", async () => {
      const response = await makeZodVerifiedAPICall(
        BlobStorageIntegrationV1Response,
        "DELETE",
        "/api/public/integrations/blob-storage",
        undefined,
        auth,
      );

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        projectId,
        type: BlobStorageIntegrationType.S3,
        bucketName: "test-bucket",
        region: "us-east-1",
        accessKeyId: "AKIAIOSFODNN7EXAMPLE",
        prefix: "test/",
        exportFrequency: "daily",
        enabled: true,
        forcePathStyle: false,
        fileType: BlobStorageIntegrationFileType.JSONL,
      });

      // Verify integration is deleted by trying to get it
      const getResponse = await makeZodVerifiedAPICall(
        BlobStorageIntegrationV1Response,
        "GET",
        "/api/public/integrations/blob-storage",
        undefined,
        auth,
      );

      expect(getResponse.status).toBe(404);
    });

    it("should fail when integration doesn't exist", async () => {
      // Delete the integration first
      await makeZodVerifiedAPICall(
        BlobStorageIntegrationV1Response,
        "DELETE",
        "/api/public/integrations/blob-storage",
        undefined,
        auth,
      );

      // Try to delete again should fail
      const response = await makeZodVerifiedAPICall(
        BlobStorageIntegrationV1Response,
        "DELETE",
        "/api/public/integrations/blob-storage",
        undefined,
        auth,
      );

      expect(response.status).toBe(404);
    });
  });

  describe("Integration types", () => {
    it("should support S3_COMPATIBLE type", async () => {
      const createBody: PostBlobStorageIntegrationV1Body = {
        type: BlobStorageIntegrationType.S3_COMPATIBLE,
        bucketName: "s3-compatible-bucket",
        endpoint: "https://s3.custom-provider.com",
        region: "us-east-1",
        accessKeyId: "AKIAIOSFODNN7EXAMPLE",
        secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
        forcePathStyle: true,
      };

      const response = await makeZodVerifiedAPICall(
        BlobStorageIntegrationV1Response,
        "POST",
        "/api/public/integrations/blob-storage",
        createBody,
        auth,
      );

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        type: BlobStorageIntegrationType.S3_COMPATIBLE,
        endpoint: "https://s3.custom-provider.com",
        forcePathStyle: true,
      });
    });

    it("should support AZURE_BLOB_STORAGE type", async () => {
      const createBody: PostBlobStorageIntegrationV1Body = {
        type: BlobStorageIntegrationType.AZURE_BLOB_STORAGE,
        bucketName: "azure-container",
        endpoint: "https://myaccount.blob.core.windows.net",
        region: "eastus",
        accessKeyId: "myaccount",
        secretAccessKey: "base64-encoded-key",
      };

      const response = await makeZodVerifiedAPICall(
        BlobStorageIntegrationV1Response,
        "POST",
        "/api/public/integrations/blob-storage",
        createBody,
        auth,
      );

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        type: BlobStorageIntegrationType.AZURE_BLOB_STORAGE,
        endpoint: "https://myaccount.blob.core.windows.net",
        region: "eastus",
      });
    });
  });

  describe("File types", () => {
    it("should support JSON file type", async () => {
      const createBody: PostBlobStorageIntegrationV1Body = {
        type: BlobStorageIntegrationType.S3,
        bucketName: "json-bucket",
        accessKeyId: "AKIAIOSFODNN7EXAMPLE",
        secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
        fileType: BlobStorageIntegrationFileType.JSON,
      };

      const response = await makeZodVerifiedAPICall(
        BlobStorageIntegrationV1Response,
        "POST",
        "/api/public/integrations/blob-storage",
        createBody,
        auth,
      );

      expect(response.status).toBe(201);
      expect(response.body.fileType).toBe(BlobStorageIntegrationFileType.JSON);
    });

    it("should support CSV file type", async () => {
      const createBody: PostBlobStorageIntegrationV1Body = {
        type: BlobStorageIntegrationType.S3,
        bucketName: "csv-bucket",
        accessKeyId: "AKIAIOSFODNN7EXAMPLE",
        secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
        fileType: BlobStorageIntegrationFileType.CSV,
      };

      const response = await makeZodVerifiedAPICall(
        BlobStorageIntegrationV1Response,
        "POST",
        "/api/public/integrations/blob-storage",
        createBody,
        auth,
      );

      expect(response.status).toBe(201);
      expect(response.body.fileType).toBe(BlobStorageIntegrationFileType.CSV);
    });
  });
});
