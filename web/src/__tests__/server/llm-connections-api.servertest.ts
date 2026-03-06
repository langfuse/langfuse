/** @jest-environment node */

import { prisma } from "@langfuse/shared/src/db";
import {
  makeAPICall,
  makeZodVerifiedAPICall,
} from "@/src/__tests__/test-utils";
import {
  GetLlmConnectionsV1Response,
  PutLlmConnectionV1Response,
} from "@/src/features/public-api/types/llm-connections";
import { createOrgProjectAndApiKey } from "@langfuse/shared/src/server";
import { LLMAdapter } from "@langfuse/shared";
import { encrypt } from "@langfuse/shared/encryption";

// Generate truly unique provider names for tests to avoid conflicts
const generateUniqueProvider = (baseName: string) =>
  `${baseName}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

describe("/api/public/llm-connections API Endpoints", () => {
  let auth: string;
  let projectId: string;

  beforeEach(async () => {
    const { auth: newAuth, projectId: newProjectId } =
      await createOrgProjectAndApiKey();
    auth = newAuth;
    projectId = newProjectId;
  });

  describe("GET /api/public/llm-connections", () => {
    it("should return empty array when no connections exist", async () => {
      const response = await makeZodVerifiedAPICall(
        GetLlmConnectionsV1Response,
        "GET",
        "/api/public/llm-connections?page=1&limit=10",
        undefined,
        auth,
      );

      expect(response.status).toBe(200);
      expect(response.body.data).toEqual([]);
      expect(response.body.meta).toEqual({
        page: 1,
        limit: 10,
        totalItems: 0,
        totalPages: 0,
      });
    });

    it("should return paginated LLM connections without secrets", async () => {
      const provider1 = generateUniqueProvider("openai");
      const provider2 = generateUniqueProvider("anthropic");

      // Create test LLM connections
      const connection1 = await prisma.llmApiKeys.create({
        data: {
          projectId,
          provider: provider1,
          adapter: LLMAdapter.OpenAI,
          secretKey: encrypt("sk-test1"),
          displaySecretKey: "...est1",
          baseURL: "https://api.openai.com/v1",
          customModels: ["gpt-4", "gpt-3.5-turbo"],
          withDefaultModels: true,
          extraHeaders: encrypt(JSON.stringify({ "X-Custom": "header1" })),
          extraHeaderKeys: ["X-Custom"],
        },
      });

      const connection2 = await prisma.llmApiKeys.create({
        data: {
          projectId,
          provider: provider2,
          adapter: LLMAdapter.Anthropic,
          secretKey: encrypt("sk-ant-test2"),
          displaySecretKey: "...est2",
          baseURL: null,
          customModels: [],
          withDefaultModels: true,
          extraHeaders: null,
          extraHeaderKeys: [],
        },
      });

      const response = await makeZodVerifiedAPICall(
        GetLlmConnectionsV1Response,
        "GET",
        "/api/public/llm-connections?page=1&limit=10",
        undefined,
        auth,
      );

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.meta).toEqual({
        page: 1,
        limit: 10,
        totalItems: 2,
        totalPages: 1,
      });

      // Verify first connection (most recent)
      const firstConnection = response.body.data[0];
      expect(firstConnection.id).toBe(connection2.id);
      expect(firstConnection.provider).toBe(provider2);
      expect(firstConnection.adapter).toBe(LLMAdapter.Anthropic);
      expect(firstConnection.displaySecretKey).toBe("...est2");
      expect(firstConnection.baseURL).toBeNull();
      expect(firstConnection.customModels).toEqual([]);
      expect(firstConnection.withDefaultModels).toBe(true);
      expect(firstConnection.extraHeaderKeys).toEqual([]);

      // Verify second connection
      const secondConnection = response.body.data[1];
      expect(secondConnection.id).toBe(connection1.id);
      expect(secondConnection.provider).toBe(provider1);
      expect(secondConnection.adapter).toBe(LLMAdapter.OpenAI);
      expect(secondConnection.displaySecretKey).toBe("...est1");
      expect(secondConnection.baseURL).toBe("https://api.openai.com/v1");
      expect(secondConnection.customModels).toEqual(["gpt-4", "gpt-3.5-turbo"]);
      expect(secondConnection.withDefaultModels).toBe(true);
      expect(secondConnection.extraHeaderKeys).toEqual(["X-Custom"]);

      // Ensure no sensitive data is exposed
      expect(firstConnection).not.toHaveProperty("secretKey");
      expect(firstConnection).not.toHaveProperty("extraHeaders");
      expect(secondConnection).not.toHaveProperty("secretKey");
      expect(secondConnection).not.toHaveProperty("extraHeaders");

      // Config is now a valid field (null for connections without config)
      expect(firstConnection.config).toBeNull();
      expect(secondConnection.config).toBeNull();
    });

    it("should handle pagination correctly", async () => {
      // Create 3 test connections
      await Promise.all([
        prisma.llmApiKeys.create({
          data: {
            projectId,
            provider: generateUniqueProvider("provider1"),
            adapter: LLMAdapter.OpenAI,
            secretKey: encrypt("sk-test1"),
            displaySecretKey: "...est1",
          },
        }),
        prisma.llmApiKeys.create({
          data: {
            projectId,
            provider: generateUniqueProvider("provider2"),
            adapter: LLMAdapter.Anthropic,
            secretKey: encrypt("sk-test2"),
            displaySecretKey: "...est2",
          },
        }),
        prisma.llmApiKeys.create({
          data: {
            projectId,
            provider: generateUniqueProvider("provider3"),
            adapter: LLMAdapter.OpenAI,
            secretKey: encrypt("sk-test3"),
            displaySecretKey: "...est3",
          },
        }),
      ]);

      // Test first page
      const page1Response = await makeZodVerifiedAPICall(
        GetLlmConnectionsV1Response,
        "GET",
        "/api/public/llm-connections?page=1&limit=2",
        undefined,
        auth,
      );

      expect(page1Response.body.data).toHaveLength(2);
      expect(page1Response.body.meta).toEqual({
        page: 1,
        limit: 2,
        totalItems: 3,
        totalPages: 2,
      });

      // Test second page
      const page2Response = await makeZodVerifiedAPICall(
        GetLlmConnectionsV1Response,
        "GET",
        "/api/public/llm-connections?page=2&limit=2",
        undefined,
        auth,
      );

      expect(page2Response.body.data).toHaveLength(1);
      expect(page2Response.body.meta).toEqual({
        page: 2,
        limit: 2,
        totalItems: 3,
        totalPages: 2,
      });
    });

    it("should return 401 for invalid auth", async () => {
      const response = await makeAPICall(
        "GET",
        "/api/public/llm-connections?page=1&limit=10",
        undefined,
        "invalid-auth",
      );

      expect(response.status).toBe(401);
    });

    it("should return 400 for invalid query parameters", async () => {
      // Test negative page
      const negativePageResponse = await makeAPICall(
        "GET",
        "/api/public/llm-connections?page=-1&limit=10",
        undefined,
        auth,
      );
      expect(negativePageResponse.status).toBe(400);

      // Test negative limit
      const negativeLimitResponse = await makeAPICall(
        "GET",
        "/api/public/llm-connections?page=1&limit=-1",
        undefined,
        auth,
      );
      expect(negativeLimitResponse.status).toBe(400);
    });

    it("should use default pagination values when not provided", async () => {
      const response = await makeZodVerifiedAPICall(
        GetLlmConnectionsV1Response,
        "GET",
        "/api/public/llm-connections",
        undefined,
        auth,
      );

      expect(response.status).toBe(200);
      expect(response.body.meta.page).toBe(1);
      expect(response.body.meta.limit).toBe(50); // Default limit
    });

    it("should handle edge cases for pagination", async () => {
      // Create one connection
      await prisma.llmApiKeys.create({
        data: {
          projectId,
          provider: generateUniqueProvider("edge-test"),
          adapter: LLMAdapter.OpenAI,
          secretKey: encrypt("sk-edge"),
          displaySecretKey: "...dge",
        },
      });

      // Test requesting page beyond available data
      const beyondPageResponse = await makeZodVerifiedAPICall(
        GetLlmConnectionsV1Response,
        "GET",
        "/api/public/llm-connections?page=5&limit=10",
        undefined,
        auth,
      );

      expect(beyondPageResponse.status).toBe(200);
      expect(beyondPageResponse.body.data).toHaveLength(0);
      expect(beyondPageResponse.body.meta).toEqual({
        page: 5,
        limit: 10,
        totalItems: 1,
        totalPages: 1,
      });
    });
  });

  describe("PUT /api/public/llm-connections", () => {
    it("should create new LLM connection successfully", async () => {
      const createData = {
        provider: generateUniqueProvider("openai"),
        adapter: LLMAdapter.OpenAI,
        secretKey: "sk-test123",
        baseURL: "https://api.openai.com/v1",
        customModels: ["gpt-4", "gpt-3.5-turbo"],
        withDefaultModels: true,
        extraHeaders: {
          "X-Custom": "header",
        },
      };

      const response = await makeZodVerifiedAPICall(
        PutLlmConnectionV1Response,
        "PUT",
        "/api/public/llm-connections",
        createData,
        auth,
        201,
      );

      expect(response.status).toBe(201); // Should return 201 for create
      expect(response.body.provider).toBe(createData.provider);
      expect(response.body.adapter).toBe(LLMAdapter.OpenAI);
      expect(response.body.displaySecretKey).toBe("...t123");
      expect(response.body.baseURL).toBe("https://api.openai.com/v1");
      expect(response.body.customModels).toEqual(["gpt-4", "gpt-3.5-turbo"]);
      expect(response.body.withDefaultModels).toBe(true);
      expect(response.body.extraHeaderKeys).toEqual(["X-Custom"]);

      // Ensure no sensitive data is exposed
      expect(response.body).not.toHaveProperty("secretKey");
      expect(response.body).not.toHaveProperty("extraHeaders");

      // Config should be null for adapters that don't use it
      expect(response.body.config).toBeNull();

      // Verify database record was created
      const dbConnection = await prisma.llmApiKeys.findUnique({
        where: {
          projectId_provider: {
            projectId,
            provider: createData.provider,
          },
        },
      });
      expect(dbConnection).toBeTruthy();
      expect(dbConnection?.adapter).toBe(LLMAdapter.OpenAI);
    });

    it("should create connection with minimal required fields", async () => {
      const createData = {
        provider: generateUniqueProvider("anthropic"),
        adapter: LLMAdapter.Anthropic,
        secretKey: "sk-ant-test",
      };

      const response = await makeZodVerifiedAPICall(
        PutLlmConnectionV1Response,
        "PUT",
        "/api/public/llm-connections",
        createData,
        auth,
        201,
      );

      expect(response.status).toBe(201); // Should return 201 for create
      expect(response.body.provider).toBe(createData.provider);
      expect(response.body.adapter).toBe(LLMAdapter.Anthropic);
      expect(response.body.baseURL).toBeNull();
      expect(response.body.customModels).toEqual([]);
      expect(response.body.withDefaultModels).toBe(true); // Defaults to true when not provided
      expect(response.body.extraHeaderKeys).toEqual([]);
    });

    it("should update existing connection (upsert)", async () => {
      const existingProvider = generateUniqueProvider("existing-provider");

      // First, create a connection
      const originalConnection = await prisma.llmApiKeys.create({
        data: {
          projectId,
          provider: existingProvider,
          adapter: LLMAdapter.OpenAI,
          secretKey: encrypt("sk-original"),
          displaySecretKey: "...nal",
          baseURL: "https://original.com",
          customModels: ["gpt-3.5"],
          withDefaultModels: true,
        },
      });

      // Try to upsert with the same provider (should update)
      const upsertData = {
        provider: existingProvider,
        adapter: LLMAdapter.Anthropic, // Changed adapter
        secretKey: "sk-updated",
        baseURL: "https://updated.com",
        customModels: ["claude-3"],
        withDefaultModels: false,
      };

      const response = await makeZodVerifiedAPICall(
        PutLlmConnectionV1Response,
        "PUT",
        "/api/public/llm-connections",
        upsertData,
        auth,
        200,
      );

      expect(response.status).toBe(200); // Should return 200 for update
      expect(response.body.id).toBe(originalConnection.id); // Same ID
      expect(response.body.provider).toBe(existingProvider);
      expect(response.body.adapter).toBe(LLMAdapter.Anthropic); // Updated
      expect(response.body.displaySecretKey).toBe("...ated"); // Updated
      expect(response.body.baseURL).toBe("https://updated.com"); // Updated
      expect(response.body.customModels).toEqual(["claude-3"]); // Updated
      expect(response.body.withDefaultModels).toBe(false); // Updated
    });

    it("should return 401 for invalid auth", async () => {
      const createData = {
        provider: generateUniqueProvider("test-provider"),
        adapter: LLMAdapter.OpenAI,
        secretKey: "sk-test",
      };

      const response = await makeAPICall(
        "PUT",
        "/api/public/llm-connections",
        createData,
        "invalid-auth",
      );

      expect(response.status).toBe(401);
    });

    it("should return 400 for invalid request body", async () => {
      // Test empty provider
      const emptyProviderResponse = await makeAPICall(
        "PUT",
        "/api/public/llm-connections",
        {
          provider: "",
          adapter: LLMAdapter.OpenAI,
          secretKey: "sk-test",
        },
        auth,
      );
      expect(emptyProviderResponse.status).toBe(400);

      // Test missing provider
      const missingProviderResponse = await makeAPICall(
        "PUT",
        "/api/public/llm-connections",
        {
          adapter: LLMAdapter.OpenAI,
          secretKey: "sk-test",
        },
        auth,
      );
      expect(missingProviderResponse.status).toBe(400);

      // Test missing adapter
      const missingAdapterResponse = await makeAPICall(
        "PUT",
        "/api/public/llm-connections",
        {
          provider: generateUniqueProvider("test-provider-missing-adapter"),
          secretKey: "sk-test",
        },
        auth,
      );
      expect(missingAdapterResponse.status).toBe(400);

      // Test empty secretKey
      const emptySecretResponse = await makeAPICall(
        "PUT",
        "/api/public/llm-connections",
        {
          provider: generateUniqueProvider("test-provider-empty-secret"),
          adapter: LLMAdapter.OpenAI,
          secretKey: "",
        },
        auth,
      );
      expect(emptySecretResponse.status).toBe(400);

      // Test invalid baseURL
      const invalidUrlResponse = await makeAPICall(
        "PUT",
        "/api/public/llm-connections",
        {
          provider: generateUniqueProvider("test-provider-invalid-url"),
          adapter: LLMAdapter.OpenAI,
          secretKey: "sk-test",
          baseURL: "not-a-valid-url",
        },
        auth,
      );
      expect(invalidUrlResponse.status).toBe(400);

      // Test invalid adapter enum
      const invalidAdapterResponse = await makeAPICall(
        "PUT",
        "/api/public/llm-connections",
        {
          provider: generateUniqueProvider("test-provider-invalid-adapter"),
          adapter: "invalid-adapter",
          secretKey: "sk-test",
        },
        auth,
      );
      expect(invalidAdapterResponse.status).toBe(400);
    });

    it("should handle all LLM adapter types", async () => {
      // Adapters that don't require config
      const adaptersWithoutConfig = [
        {
          adapter: LLMAdapter.OpenAI,
          provider: generateUniqueProvider("test-openai"),
        },
        {
          adapter: LLMAdapter.Anthropic,
          provider: generateUniqueProvider("test-anthropic"),
        },
        {
          adapter: LLMAdapter.Azure,
          provider: generateUniqueProvider("test-azure"),
        },
        {
          adapter: LLMAdapter.GoogleAIStudio,
          provider: generateUniqueProvider("test-studio"),
        },
      ];

      for (const { adapter, provider } of adaptersWithoutConfig) {
        const response = await makeZodVerifiedAPICall(
          PutLlmConnectionV1Response,
          "PUT",
          "/api/public/llm-connections",
          {
            provider,
            adapter,
            secretKey: `sk-${provider}-test`,
          },
          auth,
          201,
        );

        expect(response.status).toBe(201);
        expect(response.body.adapter).toBe(adapter);
        expect(response.body.provider).toBe(provider);
        expect(response.body.config).toBeNull();
      }

      // Bedrock requires config with region
      const bedrockResponse = await makeZodVerifiedAPICall(
        PutLlmConnectionV1Response,
        "PUT",
        "/api/public/llm-connections",
        {
          provider: generateUniqueProvider("test-bedrock"),
          adapter: LLMAdapter.Bedrock,
          secretKey: JSON.stringify({
            accessKeyId: "AKIAIOSFODNN7EXAMPLE",
            secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
          }),
          config: { region: "us-east-1" },
        },
        auth,
        201,
      );
      expect(bedrockResponse.status).toBe(201);
      expect(bedrockResponse.body.adapter).toBe(LLMAdapter.Bedrock);
      expect(bedrockResponse.body.config).toEqual({ region: "us-east-1" });

      // VertexAI works with or without config
      const vertexResponse = await makeZodVerifiedAPICall(
        PutLlmConnectionV1Response,
        "PUT",
        "/api/public/llm-connections",
        {
          provider: generateUniqueProvider("test-vertex"),
          adapter: LLMAdapter.VertexAI,
          secretKey: JSON.stringify({
            type: "service_account",
            project_id: "test-project",
            private_key_id: "key123",
            private_key:
              "-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----",
            client_email: "test@test-project.iam.gserviceaccount.com",
            client_id: "123456789",
            auth_uri: "https://accounts.google.com/o/oauth2/auth",
            token_uri: "https://oauth2.googleapis.com/token",
            auth_provider_x509_cert_url:
              "https://www.googleapis.com/oauth2/v1/certs",
            client_x509_cert_url:
              "https://www.googleapis.com/robot/v1/metadata/x509/test",
          }),
        },
        auth,
        201,
      );
      expect(vertexResponse.status).toBe(201);
      expect(vertexResponse.body.adapter).toBe(LLMAdapter.VertexAI);
      expect(vertexResponse.body.config).toBeNull();
    });

    it("should handle optional fields correctly", async () => {
      // Test with all optional fields provided
      const fullDataResponse = await makeZodVerifiedAPICall(
        PutLlmConnectionV1Response,
        "PUT",
        "/api/public/llm-connections",
        {
          provider: generateUniqueProvider("full-test"),
          adapter: LLMAdapter.OpenAI,
          secretKey: "sk-full-test",
          baseURL: "https://custom.api.com/v1",
          customModels: ["custom-model-1", "custom-model-2"],
          withDefaultModels: false,
          extraHeaders: {
            "X-API-Version": "2023-01-01",
            "X-Custom-Header": "value",
          },
        },
        auth,
        201,
      );

      expect(fullDataResponse.status).toBe(201);
      expect(fullDataResponse.body.baseURL).toBe("https://custom.api.com/v1");
      expect(fullDataResponse.body.customModels).toEqual([
        "custom-model-1",
        "custom-model-2",
      ]);
      expect(fullDataResponse.body.withDefaultModels).toBe(false);
      expect(fullDataResponse.body.extraHeaderKeys).toEqual([
        "X-API-Version",
        "X-Custom-Header",
      ]);

      // Test with no optional fields (should use defaults)
      const minimalDataResponse = await makeZodVerifiedAPICall(
        PutLlmConnectionV1Response,
        "PUT",
        "/api/public/llm-connections",
        {
          provider: generateUniqueProvider("minimal-test"),
          adapter: LLMAdapter.Anthropic,
          secretKey: "sk-minimal-test",
        },
        auth,
        201,
      );

      expect(minimalDataResponse.status).toBe(201);
      expect(minimalDataResponse.body.baseURL).toBeNull();
      expect(minimalDataResponse.body.customModels).toEqual([]);
      expect(minimalDataResponse.body.withDefaultModels).toBe(true); // Should use default value of true
      expect(minimalDataResponse.body.extraHeaderKeys).toEqual([]);
    });

    it("should handle empty arrays and null values", async () => {
      const response = await makeZodVerifiedAPICall(
        PutLlmConnectionV1Response,
        "PUT",
        "/api/public/llm-connections",
        {
          provider: generateUniqueProvider("empty-arrays-test"),
          adapter: LLMAdapter.OpenAI,
          secretKey: "sk-empty-test",
          baseURL: null,
          customModels: [],
          extraHeaders: {},
        },
        auth,
        201,
      );

      expect(response.status).toBe(201);
      expect(response.body.baseURL).toBeNull();
      expect(response.body.customModels).toEqual([]);
      expect(response.body.extraHeaderKeys).toEqual([]);
    });

    it("should apply Zod schema defaults correctly", async () => {
      // Test that withDefaultModels gets default value of true when not provided
      const minimalResponse = await makeZodVerifiedAPICall(
        PutLlmConnectionV1Response,
        "PUT",
        "/api/public/llm-connections",
        {
          provider: generateUniqueProvider("zod-defaults-test"),
          adapter: LLMAdapter.OpenAI,
          secretKey: "sk-zod-test",
          // Note: withDefaultModels not provided, should default to true
        },
        auth,
        201,
      );

      expect(minimalResponse.status).toBe(201);
      expect(minimalResponse.body.withDefaultModels).toBe(true);

      // Test explicit false value works
      const explicitFalseResponse = await makeZodVerifiedAPICall(
        PutLlmConnectionV1Response,
        "PUT",
        "/api/public/llm-connections",
        {
          provider: generateUniqueProvider("zod-explicit-false-test"),
          adapter: LLMAdapter.OpenAI,
          secretKey: "sk-zod-explicit-test",
          withDefaultModels: false,
        },
        auth,
        201,
      );

      expect(explicitFalseResponse.status).toBe(201);
      expect(explicitFalseResponse.body.withDefaultModels).toBe(false);
    });

    it("should create correct audit log entries for create and update", async () => {
      const createData = {
        provider: generateUniqueProvider("audit-test"),
        adapter: LLMAdapter.OpenAI,
        secretKey: "sk-audit-test",
      };

      // Create connection
      const createResponse = await makeZodVerifiedAPICall(
        PutLlmConnectionV1Response,
        "PUT",
        "/api/public/llm-connections",
        createData,
        auth,
        201,
      );

      expect(createResponse.status).toBe(201);

      // Verify create audit log
      const createAuditLogs = await prisma.auditLog.findMany({
        where: {
          resourceType: "llmApiKey",
          resourceId: createResponse.body.id,
          action: "create",
        },
      });
      expect(createAuditLogs).toHaveLength(1);

      // Update the same connection
      const updateData = {
        provider: createData.provider,
        adapter: LLMAdapter.Anthropic, // Change adapter
        secretKey: "sk-audit-updated",
      };

      const updateResponse = await makeZodVerifiedAPICall(
        PutLlmConnectionV1Response,
        "PUT",
        "/api/public/llm-connections",
        updateData,
        auth,
        200,
      );

      expect(updateResponse.status).toBe(200);
      expect(updateResponse.body.id).toBe(createResponse.body.id); // Same ID

      // Verify update audit log
      const updateAuditLogs = await prisma.auditLog.findMany({
        where: {
          resourceType: "llmApiKey",
          resourceId: updateResponse.body.id,
          action: "update",
        },
      });
      expect(updateAuditLogs).toHaveLength(1);
    });

    it("should handle special characters in provider names", async () => {
      const specialProviders = [
        generateUniqueProvider("provider-with-dashes"),
        generateUniqueProvider("provider_with_underscores"),
        generateUniqueProvider("provider123"),
        generateUniqueProvider("ProviderWithCaps"),
      ];

      for (const provider of specialProviders) {
        const response = await makeZodVerifiedAPICall(
          PutLlmConnectionV1Response,
          "PUT",
          "/api/public/llm-connections",
          {
            provider,
            adapter: LLMAdapter.OpenAI,
            secretKey: `sk-${provider}-test`,
          },
          auth,
          201,
        );

        expect(response.status).toBe(201);
        expect(response.body.provider).toBe(provider);
      }
    });

    it("should handle very long secret keys", async () => {
      const longSecretKey = "sk-" + "a".repeat(500); // Very long key

      const response = await makeZodVerifiedAPICall(
        PutLlmConnectionV1Response,
        "PUT",
        "/api/public/llm-connections",
        {
          provider: generateUniqueProvider("long-key-test"),
          adapter: LLMAdapter.OpenAI,
          secretKey: longSecretKey,
        },
        auth,
        201,
      );

      expect(response.status).toBe(201);
      expect(response.body.displaySecretKey).toBe(
        "..." + longSecretKey.slice(-4),
      );
    });

    it("should handle multiple extra headers", async () => {
      const extraHeaders = {
        "X-API-Key": "additional-key",
        "X-Client-Version": "1.0.0",
        "X-Environment": "production",
        Authorization: "Bearer token123",
        "Content-Type": "application/json",
      };

      const response = await makeZodVerifiedAPICall(
        PutLlmConnectionV1Response,
        "PUT",
        "/api/public/llm-connections",
        {
          provider: generateUniqueProvider("multi-headers-test"),
          adapter: LLMAdapter.OpenAI,
          secretKey: "sk-headers-test",
          extraHeaders,
        },
        auth,
        201,
      );

      expect(response.status).toBe(201);
      expect(response.body.extraHeaderKeys).toHaveLength(5);
      expect(response.body.extraHeaderKeys).toEqual(
        expect.arrayContaining(Object.keys(extraHeaders)),
      );
      // Ensure header values are not exposed
      expect(response.body).not.toHaveProperty("extraHeaders");
    });

    describe("Config validation", () => {
      it("should create Bedrock connection with region config", async () => {
        const createData = {
          provider: generateUniqueProvider("bedrock-config-test"),
          adapter: LLMAdapter.Bedrock,
          secretKey: JSON.stringify({
            accessKeyId: "AKIAIOSFODNN7EXAMPLE",
            secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
          }),
          config: {
            region: "us-east-1",
          },
        };

        const response = await makeZodVerifiedAPICall(
          PutLlmConnectionV1Response,
          "PUT",
          "/api/public/llm-connections",
          createData,
          auth,
          201,
        );

        expect(response.status).toBe(201);
        expect(response.body.adapter).toBe(LLMAdapter.Bedrock);
        expect(response.body.config).toEqual({ region: "us-east-1" });

        // Verify database persistence
        const dbConnection = await prisma.llmApiKeys.findUnique({
          where: {
            projectId_provider: {
              projectId,
              provider: createData.provider,
            },
          },
        });
        expect(dbConnection?.config).toEqual({ region: "us-east-1" });
      });

      it("should reject Bedrock connection without config", async () => {
        const createData = {
          provider: generateUniqueProvider("bedrock-no-config"),
          adapter: LLMAdapter.Bedrock,
          secretKey: JSON.stringify({
            accessKeyId: "AKIAIOSFODNN7EXAMPLE",
            secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
          }),
          // No config provided
        };

        const response = await makeAPICall(
          "PUT",
          "/api/public/llm-connections",
          createData,
          auth,
        );

        expect(response.status).toBe(400);
        expect(JSON.stringify(response.body)).toContain(
          "Config is required for Bedrock adapter",
        );
      });

      it("should reject Bedrock connection with invalid config", async () => {
        const createData = {
          provider: generateUniqueProvider("bedrock-bad-config"),
          adapter: LLMAdapter.Bedrock,
          secretKey: JSON.stringify({
            accessKeyId: "AKIAIOSFODNN7EXAMPLE",
            secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
          }),
          config: {
            location: "us-central1", // Wrong key - should be 'region'
          },
        };

        const response = await makeAPICall(
          "PUT",
          "/api/public/llm-connections",
          createData,
          auth,
        );

        expect(response.status).toBe(400);
        expect(JSON.stringify(response.body)).toContain(
          "Invalid Bedrock config",
        );
      });

      it("should create VertexAI connection with location config", async () => {
        const createData = {
          provider: generateUniqueProvider("vertexai-config-test"),
          adapter: LLMAdapter.VertexAI,
          secretKey: JSON.stringify({
            type: "service_account",
            project_id: "test-project",
            private_key_id: "key123",
            private_key:
              "-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----",
            client_email: "test@test-project.iam.gserviceaccount.com",
            client_id: "123456789",
            auth_uri: "https://accounts.google.com/o/oauth2/auth",
            token_uri: "https://oauth2.googleapis.com/token",
            auth_provider_x509_cert_url:
              "https://www.googleapis.com/oauth2/v1/certs",
            client_x509_cert_url:
              "https://www.googleapis.com/robot/v1/metadata/x509/test",
          }),
          config: {
            location: "us-central1",
          },
        };

        const response = await makeZodVerifiedAPICall(
          PutLlmConnectionV1Response,
          "PUT",
          "/api/public/llm-connections",
          createData,
          auth,
          201,
        );

        expect(response.status).toBe(201);
        expect(response.body.config).toEqual({ location: "us-central1" });
      });

      it("should create VertexAI connection without config", async () => {
        const createData = {
          provider: generateUniqueProvider("vertexai-no-config"),
          adapter: LLMAdapter.VertexAI,
          secretKey: JSON.stringify({
            type: "service_account",
            project_id: "test-project",
            private_key_id: "key123",
            private_key:
              "-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----",
            client_email: "test@test-project.iam.gserviceaccount.com",
            client_id: "123456789",
            auth_uri: "https://accounts.google.com/o/oauth2/auth",
            token_uri: "https://oauth2.googleapis.com/token",
            auth_provider_x509_cert_url:
              "https://www.googleapis.com/oauth2/v1/certs",
            client_x509_cert_url:
              "https://www.googleapis.com/robot/v1/metadata/x509/test",
          }),
          // No config - allowed for VertexAI
        };

        const response = await makeZodVerifiedAPICall(
          PutLlmConnectionV1Response,
          "PUT",
          "/api/public/llm-connections",
          createData,
          auth,
          201,
        );

        expect(response.status).toBe(201);
        expect(response.body.config).toBeNull();
      });

      it("should reject OpenAI connection with config", async () => {
        const createData = {
          provider: generateUniqueProvider("openai-with-config"),
          adapter: LLMAdapter.OpenAI,
          secretKey: "sk-test123",
          config: {
            region: "us-east-1", // OpenAI doesn't support config
          },
        };

        const response = await makeAPICall(
          "PUT",
          "/api/public/llm-connections",
          createData,
          auth,
        );

        expect(response.status).toBe(400);
        expect(JSON.stringify(response.body)).toContain(
          "Config is not supported for openai adapter",
        );
      });

      it("should update existing Bedrock connection config", async () => {
        const provider = generateUniqueProvider("bedrock-update-config");

        // Create with initial config
        await makeZodVerifiedAPICall(
          PutLlmConnectionV1Response,
          "PUT",
          "/api/public/llm-connections",
          {
            provider,
            adapter: LLMAdapter.Bedrock,
            secretKey: JSON.stringify({
              accessKeyId: "AKIAIOSFODNN7EXAMPLE",
              secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
            }),
            config: { region: "us-east-1" },
          },
          auth,
          201,
        );

        // Update config
        const updateResponse = await makeZodVerifiedAPICall(
          PutLlmConnectionV1Response,
          "PUT",
          "/api/public/llm-connections",
          {
            provider,
            adapter: LLMAdapter.Bedrock,
            secretKey: JSON.stringify({
              accessKeyId: "AKIAIOSFODNN7EXAMPLE",
              secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
            }),
            config: { region: "eu-west-1" },
          },
          auth,
          200,
        );

        expect(updateResponse.status).toBe(200);
        expect(updateResponse.body.config).toEqual({ region: "eu-west-1" });
      });

      it("should return config in GET response", async () => {
        const provider = generateUniqueProvider("bedrock-get-config");

        await prisma.llmApiKeys.create({
          data: {
            projectId,
            provider,
            adapter: LLMAdapter.Bedrock,
            secretKey: encrypt(
              JSON.stringify({
                accessKeyId: "AKIAIOSFODNN7EXAMPLE",
                secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
              }),
            ),
            displaySecretKey: "...KEY",
            config: { region: "ap-southeast-1" },
          },
        });

        const response = await makeZodVerifiedAPICall(
          GetLlmConnectionsV1Response,
          "GET",
          "/api/public/llm-connections?page=1&limit=10",
          undefined,
          auth,
        );

        const connection = response.body.data.find(
          (c) => c.provider === provider,
        );
        expect(connection?.config).toEqual({ region: "ap-southeast-1" });
      });

      it("should reject VertexAI connection with invalid config", async () => {
        const createData = {
          provider: generateUniqueProvider("vertexai-bad-config"),
          adapter: LLMAdapter.VertexAI,
          secretKey: JSON.stringify({
            type: "service_account",
            project_id: "test-project",
            private_key_id: "key123",
            private_key:
              "-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----",
            client_email: "test@test-project.iam.gserviceaccount.com",
            client_id: "123456789",
            auth_uri: "https://accounts.google.com/o/oauth2/auth",
            token_uri: "https://oauth2.googleapis.com/token",
            auth_provider_x509_cert_url:
              "https://www.googleapis.com/oauth2/v1/certs",
            client_x509_cert_url:
              "https://www.googleapis.com/robot/v1/metadata/x509/test",
          }),
          config: {
            region: "us-east-1", // Wrong key - should be 'location'
          },
        };

        const response = await makeAPICall(
          "PUT",
          "/api/public/llm-connections",
          createData,
          auth,
        );

        expect(response.status).toBe(400);
        expect(JSON.stringify(response.body)).toContain(
          "Invalid VertexAI config",
        );
      });
    });
  });

  describe("Authorization", () => {
    it("should not access connections from different project", async () => {
      // Create connection in different project
      const { projectId: otherProjectId } = await createOrgProjectAndApiKey();
      const otherProvider = generateUniqueProvider("other-provider");
      await prisma.llmApiKeys.create({
        data: {
          projectId: otherProjectId,
          provider: otherProvider,
          adapter: LLMAdapter.OpenAI,
          secretKey: encrypt("sk-other"),
          displaySecretKey: "...dfg3",
        },
      });

      // Try to access with current project auth
      const response = await makeZodVerifiedAPICall(
        GetLlmConnectionsV1Response,
        "GET",
        "/api/public/llm-connections?page=1&limit=10",
        undefined,
        auth,
      );

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(0); // Should not see other project's connections
    });

    it("should not update connections from different project with PUT", async () => {
      // Create connection in different project
      const { projectId: otherProjectId } = await createOrgProjectAndApiKey();
      const otherProvider = generateUniqueProvider(
        "other-provider-cross-project",
      );
      await prisma.llmApiKeys.create({
        data: {
          projectId: otherProjectId,
          provider: otherProvider,
          adapter: LLMAdapter.OpenAI,
          secretKey: encrypt("sk-other"),
          displaySecretKey: "...dfg3",
        },
      });

      // Try to upsert with current project auth - should create new connection in current project
      const upsertData = {
        provider: otherProvider,
        adapter: LLMAdapter.OpenAI,
        secretKey: "sk-malicious",
      };
      const response = await makeZodVerifiedAPICall(
        PutLlmConnectionV1Response,
        "PUT",
        "/api/public/llm-connections",
        upsertData,
        auth,
        201,
      );

      expect(response.status).toBe(201); // Should return 201 for create (new connection in current project)
      // Should create a new connection in the current project, not update the other project's connection
      expect(response.body.provider).toBe(upsertData.provider);
      expect(response.body.displaySecretKey).toBe("...ious");

      // Verify both connections exist in their respective projects
      const currentProjectConnection = await prisma.llmApiKeys.findFirst({
        where: { projectId, provider: otherProvider },
      });
      const otherProjectConnection = await prisma.llmApiKeys.findFirst({
        where: { projectId: otherProjectId, provider: otherProvider },
      });

      expect(currentProjectConnection).toBeTruthy();
      expect(otherProjectConnection).toBeTruthy();
      expect(currentProjectConnection?.id).not.toBe(otherProjectConnection?.id);
    });

    it("should require valid API key authentication", async () => {
      // Test with malformed auth header
      const malformedAuthResponse = await makeAPICall(
        "GET",
        "/api/public/llm-connections",
        undefined,
        "invalid-format",
      );
      expect(malformedAuthResponse.status).toBe(401);

      // Test with non-existent API key
      const fakeKeyResponse = await makeAPICall(
        "GET",
        "/api/public/llm-connections",
        undefined,
        "Basic " + Buffer.from("pk-lf-fake-key:").toString("base64"),
      );
      expect(fakeKeyResponse.status).toBe(401);
    });
  });

  describe("Data Integrity", () => {
    it("should maintain referential integrity with projects", async () => {
      // Create connection
      const response = await makeZodVerifiedAPICall(
        PutLlmConnectionV1Response,
        "PUT",
        "/api/public/llm-connections",
        {
          provider: generateUniqueProvider("integrity-test"),
          adapter: LLMAdapter.OpenAI,
          secretKey: "sk-integrity-test",
        },
        auth,
        201,
      );

      expect(response.status).toBe(201);

      // Verify connection is properly linked to project
      const dbConnection = await prisma.llmApiKeys.findUnique({
        where: { id: response.body.id },
        include: { project: true },
      });

      expect(dbConnection).toBeTruthy();
      expect(dbConnection?.projectId).toBe(projectId);
      expect(dbConnection?.project).toBeTruthy();
    });

    it("should encrypt sensitive fields in database", async () => {
      const secretKey = "sk-very-secret-key";
      const extraHeaders = {
        Authorization: "Bearer secret-token",
        "X-API-Key": "another-secret",
      };

      const response = await makeZodVerifiedAPICall(
        PutLlmConnectionV1Response,
        "PUT",
        "/api/public/llm-connections",
        {
          provider: generateUniqueProvider("encryption-test"),
          adapter: LLMAdapter.OpenAI,
          secretKey,
          extraHeaders,
        },
        auth,
        201,
      );

      expect(response.status).toBe(201);

      // Verify data is encrypted in database
      const dbConnection = await prisma.llmApiKeys.findUnique({
        where: { id: response.body.id },
      });

      expect(dbConnection).toBeTruthy();
      // Secret key should be encrypted (not equal to original)
      expect(dbConnection?.secretKey).not.toBe(secretKey);
      expect(dbConnection?.secretKey).toBeTruthy();

      // Extra headers should be encrypted (not equal to original JSON)
      expect(dbConnection?.extraHeaders).not.toBe(JSON.stringify(extraHeaders));
      expect(dbConnection?.extraHeaders).toBeTruthy();

      // Display key should be masked (last 4 characters)
      expect(dbConnection?.displaySecretKey).toBe("...-key");
    });

    it("should handle database constraints properly", async () => {
      const provider = generateUniqueProvider("constraint-test");

      // Create first connection
      const firstResponse = await makeZodVerifiedAPICall(
        PutLlmConnectionV1Response,
        "PUT",
        "/api/public/llm-connections",
        {
          provider,
          adapter: LLMAdapter.OpenAI,
          secretKey: "sk-first",
        },
        auth,
        201,
      );
      expect(firstResponse.status).toBe(201);

      // Try to create another with same provider (should update)
      const secondResponse = await makeZodVerifiedAPICall(
        PutLlmConnectionV1Response,
        "PUT",
        "/api/public/llm-connections",
        {
          provider,
          adapter: LLMAdapter.Anthropic,
          secretKey: "sk-second",
        },
        auth,
        200,
      );
      expect(secondResponse.status).toBe(200); // Update
      expect(secondResponse.body.id).toBe(firstResponse.body.id); // Same record
      expect(secondResponse.body.adapter).toBe(LLMAdapter.Anthropic); // Updated
    });
  });

  describe("Response Schema Validation", () => {
    it("should always return valid response schemas", async () => {
      // Create connection with all fields
      const fullConnection = await makeZodVerifiedAPICall(
        PutLlmConnectionV1Response,
        "PUT",
        "/api/public/llm-connections",
        {
          provider: generateUniqueProvider("schema-test"),
          adapter: LLMAdapter.OpenAI,
          secretKey: "sk-schema-test",
          baseURL: "https://api.example.com/v1",
          customModels: ["model-1", "model-2"],
          withDefaultModels: true,
          extraHeaders: { "X-Test": "value" },
        },
        auth,
        201,
      );

      expect(fullConnection.status).toBe(201);

      // Verify GET response schema
      const getResponse = await makeZodVerifiedAPICall(
        GetLlmConnectionsV1Response,
        "GET",
        "/api/public/llm-connections",
        undefined,
        auth,
      );

      expect(getResponse.status).toBe(200);
      expect(getResponse.body.data).toHaveLength(1);

      const connection = getResponse.body.data[0];

      // Verify all required fields are present and properly typed
      expect(typeof connection.id).toBe("string");
      expect(typeof connection.provider).toBe("string");
      expect(typeof connection.adapter).toBe("string");
      expect(typeof connection.displaySecretKey).toBe("string");
      expect(typeof connection.withDefaultModels).toBe("boolean");
      expect(Array.isArray(connection.customModels)).toBe(true);
      expect(Array.isArray(connection.extraHeaderKeys)).toBe(true);
      expect(typeof connection.createdAt).toBe("string");
      expect(typeof connection.updatedAt).toBe("string");
      expect(new Date(connection.createdAt).toISOString()).toBe(
        connection.createdAt,
      );
      expect(new Date(connection.updatedAt).toISOString()).toBe(
        connection.updatedAt,
      );

      // Verify baseURL can be string or null
      expect(
        connection.baseURL === null || typeof connection.baseURL === "string",
      ).toBe(true);
    });

    it("should never leak sensitive data in any response", async () => {
      const sensitiveData = {
        provider: generateUniqueProvider("leak-test"),
        adapter: LLMAdapter.OpenAI,
        secretKey: "sk-super-secret-key-12345",
        extraHeaders: {
          Authorization: "Bearer very-secret-token",
          "X-API-Key": "another-secret-value",
        },
      };

      // Create connection
      const createResponse = await makeZodVerifiedAPICall(
        PutLlmConnectionV1Response,
        "PUT",
        "/api/public/llm-connections",
        sensitiveData,
        auth,
        201,
      );

      // Verify no sensitive data in create response
      const createBody = JSON.stringify(createResponse.body);
      expect(createBody).not.toContain(sensitiveData.secretKey);
      expect(createBody).not.toContain("very-secret-token");
      expect(createBody).not.toContain("another-secret-value");
      expect(createBody).not.toContain("embedded-secret");
      expect(createBody).not.toContain("secret-password");

      // Verify no sensitive data in list response
      const listResponse = await makeZodVerifiedAPICall(
        GetLlmConnectionsV1Response,
        "GET",
        "/api/public/llm-connections",
        undefined,
        auth,
      );

      const listBody = JSON.stringify(listResponse.body);
      expect(listBody).not.toContain(sensitiveData.secretKey);
      expect(listBody).not.toContain("very-secret-token");
      expect(listBody).not.toContain("another-secret-value");
      expect(listBody).not.toContain("embedded-secret");
      expect(listBody).not.toContain("secret-password");
    });
  });
});
