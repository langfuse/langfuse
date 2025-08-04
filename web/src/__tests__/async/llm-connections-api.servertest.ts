/** @jest-environment node */

import { prisma } from "@langfuse/shared/src/db";
import {
  makeAPICall,
  makeZodVerifiedAPICall,
} from "@/src/__tests__/test-utils";
import {
  GetLlmConnectionsV1Response,
  PatchLlmConnectionV1Response,
} from "@/src/features/public-api/types/llm-connections";
import { createOrgProjectAndApiKey } from "@langfuse/shared/src/server";
import { LLMAdapter } from "@langfuse/shared";
import { encrypt } from "@langfuse/shared/encryption";

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
      // Create test LLM connections
      const connection1 = await prisma.llmApiKeys.create({
        data: {
          projectId,
          provider: "openai",
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
          provider: "anthropic",
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
      expect(firstConnection.provider).toBe("anthropic");
      expect(firstConnection.adapter).toBe(LLMAdapter.Anthropic);
      expect(firstConnection.displaySecretKey).toBe("...est2");
      expect(firstConnection.baseURL).toBeNull();
      expect(firstConnection.customModels).toEqual([]);
      expect(firstConnection.withDefaultModels).toBe(true);
      expect(firstConnection.extraHeaderKeys).toEqual([]);

      // Verify second connection
      const secondConnection = response.body.data[1];
      expect(secondConnection.id).toBe(connection1.id);
      expect(secondConnection.provider).toBe("openai");
      expect(secondConnection.adapter).toBe(LLMAdapter.OpenAI);
      expect(secondConnection.displaySecretKey).toBe("...est1");
      expect(secondConnection.baseURL).toBe("https://api.openai.com/v1");
      expect(secondConnection.customModels).toEqual(["gpt-4", "gpt-3.5-turbo"]);
      expect(secondConnection.withDefaultModels).toBe(true);
      expect(secondConnection.extraHeaderKeys).toEqual(["X-Custom"]);

      // Ensure no sensitive data is exposed
      expect(firstConnection).not.toHaveProperty("secretKey");
      expect(firstConnection).not.toHaveProperty("extraHeaders");
      expect(firstConnection).not.toHaveProperty("config");
      expect(secondConnection).not.toHaveProperty("secretKey");
      expect(secondConnection).not.toHaveProperty("extraHeaders");
      expect(secondConnection).not.toHaveProperty("config");
    });

    it("should handle pagination correctly", async () => {
      // Create 3 test connections
      await Promise.all([
        prisma.llmApiKeys.create({
          data: {
            projectId,
            provider: "provider1",
            adapter: LLMAdapter.OpenAI,
            secretKey: encrypt("sk-test1"),
            displaySecretKey: "...est1",
          },
        }),
        prisma.llmApiKeys.create({
          data: {
            projectId,
            provider: "provider2",
            adapter: LLMAdapter.Anthropic,
            secretKey: encrypt("sk-test2"),
            displaySecretKey: "...est2",
          },
        }),
        prisma.llmApiKeys.create({
          data: {
            projectId,
            provider: "provider3",
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
      const response = await makeAPICall(
        "GET",
        "/api/public/llm-connections?page=0&limit=10",
        undefined,
        auth,
      );

      expect(response.status).toBe(400);
    });
  });

  describe("PATCH /api/public/llm-connections/{providerName}", () => {
    let existingConnection: any;

    beforeEach(async () => {
      existingConnection = await prisma.llmApiKeys.create({
        data: {
          projectId,
          provider: "openai",
          adapter: LLMAdapter.OpenAI,
          secretKey: encrypt("sk-original"),
          displaySecretKey: "...inal",
          baseURL: "https://api.openai.com/v1",
          customModels: ["gpt-4"],
          withDefaultModels: true,
          extraHeaders: encrypt(JSON.stringify({ "X-Original": "value" })),
          extraHeaderKeys: ["X-Original"],
        },
      });
    });

    it("should update LLM connection successfully", async () => {
      const updateData = {
        secretKey: "sk-updated",
        baseURL: "https://custom.openai.com/v1",
        customModels: ["gpt-4", "gpt-3.5-turbo"],
        withDefaultModels: false,
        extraHeaders: {
          "X-Updated": "header",
          "X-Another": "value",
        },
      };

      const response = await makeZodVerifiedAPICall(
        PatchLlmConnectionV1Response,
        "PATCH",
        "/api/public/llm-connections/openai",
        updateData,
        auth,
      );

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(existingConnection.id);
      expect(response.body.provider).toBe("openai");
      expect(response.body.adapter).toBe(LLMAdapter.OpenAI);
      expect(response.body.displaySecretKey).toBe("...ated"); // Should be updated
      expect(response.body.baseURL).toBe("https://custom.openai.com/v1");
      expect(response.body.customModels).toEqual(["gpt-4", "gpt-3.5-turbo"]);
      expect(response.body.withDefaultModels).toBe(false);
      expect(response.body.extraHeaderKeys).toEqual(["X-Updated", "X-Another"]);

      // Ensure no sensitive data is exposed
      expect(response.body).not.toHaveProperty("secretKey");
      expect(response.body).not.toHaveProperty("extraHeaders");
      expect(response.body).not.toHaveProperty("config");

      // Verify database was actually updated
      const updatedConnection = await prisma.llmApiKeys.findUnique({
        where: { id: existingConnection.id },
      });
      expect(updatedConnection?.baseURL).toBe("https://custom.openai.com/v1");
      expect(updatedConnection?.customModels).toEqual([
        "gpt-4",
        "gpt-3.5-turbo",
      ]);
      expect(updatedConnection?.withDefaultModels).toBe(false);
    });

    it("should update only provided fields", async () => {
      const updateData = {
        baseURL: "https://updated.openai.com/v1",
      };

      const response = await makeZodVerifiedAPICall(
        PatchLlmConnectionV1Response,
        "PATCH",
        "/api/public/llm-connections/openai",
        updateData,
        auth,
      );

      expect(response.status).toBe(200);
      expect(response.body.baseURL).toBe("https://updated.openai.com/v1");
      // Other fields should remain unchanged
      expect(response.body.customModels).toEqual(["gpt-4"]);
      expect(response.body.withDefaultModels).toBe(true);
      expect(response.body.extraHeaderKeys).toEqual(["X-Original"]);
    });

    it("should clear extra headers when empty object provided", async () => {
      const updateData = {
        extraHeaders: {},
      };

      const response = await makeZodVerifiedAPICall(
        PatchLlmConnectionV1Response,
        "PATCH",
        "/api/public/llm-connections/openai",
        updateData,
        auth,
      );

      expect(response.status).toBe(200);
      expect(response.body.extraHeaderKeys).toEqual([]);
    });

    it("should return 404 for non-existent provider", async () => {
      const updateData = {
        baseURL: "https://updated.com/v1",
      };

      const response = await makeAPICall(
        "PATCH",
        "/api/public/llm-connections/nonexistent",
        updateData,
        auth,
      );

      expect(response.status).toBe(404);
      expect(response.body.message).toContain("not found");
    });

    it("should return 401 for invalid auth", async () => {
      const updateData = {
        baseURL: "https://updated.com/v1",
      };

      const response = await makeAPICall(
        "PATCH",
        "/api/public/llm-connections/openai",
        updateData,
        "invalid-auth",
      );

      expect(response.status).toBe(401);
    });

    it("should return 400 for invalid request body", async () => {
      const updateData = {
        baseURL: "not-a-valid-url",
      };

      const response = await makeAPICall(
        "PATCH",
        "/api/public/llm-connections/openai",
        updateData,
        auth,
      );

      expect(response.status).toBe(400);
    });

    it("should create audit log entry", async () => {
      const updateData = {
        baseURL: "https://audit-test.com/v1",
      };

      await makeZodVerifiedAPICall(
        PatchLlmConnectionV1Response,
        "PATCH",
        "/api/public/llm-connections/openai",
        updateData,
        auth,
      );

      // Verify audit log was created
      const auditLogs = await prisma.auditLog.findMany({
        where: {
          resourceType: "llmApiKey",
          resourceId: existingConnection.id,
          action: "update",
        },
      });

      expect(auditLogs).toHaveLength(1);
      expect(auditLogs[0].projectId).toBe(projectId);
    });
  });

  describe("Authorization", () => {
    it("should not access connections from different project", async () => {
      // Create connection in different project
      const { projectId: otherProjectId } = await createOrgProjectAndApiKey();
      await prisma.llmApiKeys.create({
        data: {
          projectId: otherProjectId,
          provider: "other-provider",
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

    it("should not update connections from different project", async () => {
      // Create connection in different project
      const { projectId: otherProjectId } = await createOrgProjectAndApiKey();
      await prisma.llmApiKeys.create({
        data: {
          projectId: otherProjectId,
          provider: "other-provider",
          adapter: LLMAdapter.OpenAI,
          secretKey: encrypt("sk-other"),
          displaySecretKey: "...dfg3",
        },
      });

      // Try to update with current project auth
      const updateData = { baseURL: "https://malicious.com/v1" };
      const response = await makeAPICall(
        "PATCH",
        "/api/public/llm-connections/other-provider",
        updateData,
        auth,
      );

      expect(response.status).toBe(404); // Should not find the connection
    });
  });
});
