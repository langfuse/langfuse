/** @jest-environment node */

// Mock queue operations to avoid Redis dependency in tests
jest.mock("@langfuse/shared/src/server", () => {
  const actual = jest.requireActual("@langfuse/shared/src/server");
  return {
    ...actual,
    // Mock queue getInstance to return a no-op queue
    EventPropagationQueue: {
      getInstance: () => ({
        add: jest.fn().mockResolvedValue(undefined),
        disconnect: jest.fn(),
      }),
    },
    EntityChangeQueue: {
      getInstance: () => ({
        add: jest.fn().mockResolvedValue(undefined),
        disconnect: jest.fn(),
      }),
    },
  };
});

import { prisma } from "@langfuse/shared/src/db";
import { nanoid } from "nanoid";
import {
  createMcpTestSetup,
  createPromptInDb,
  verifyAuditLog,
} from "./mcp-helpers";

// Import MCP tool handlers directly
import { handleCreateTextPrompt } from "@/src/features/mcp/features/prompts/tools/createTextPrompt";
import { handleCreateChatPrompt } from "@/src/features/mcp/features/prompts/tools/createChatPrompt";
import { handleUpdatePromptLabels } from "@/src/features/mcp/features/prompts/tools/updatePromptLabels";

describe("MCP Write Tools", () => {
  describe("createTextPrompt tool", () => {
    it("should create a simple text prompt", async () => {
      const { context } = await createMcpTestSetup();
      const promptName = `text-prompt-${nanoid()}`;

      const result = (await handleCreateTextPrompt(
        {
          name: promptName,
          prompt: "You are a helpful assistant.",
        },
        context,
      )) as {
        id: string;
        name: string;
        version: number;
        type: string;
        labels: string[];
        message: string;
      };

      expect(result.id).toBeDefined();
      expect(result.name).toBe(promptName);
      expect(result.version).toBe(1);
      expect(result.type).toBe("text");
      // First version automatically gets 'latest' label
      expect(result.labels).toContain("latest");
      expect(result.message).toContain("Successfully created");
    });

    it("should create text prompt with labels", async () => {
      const { context } = await createMcpTestSetup();
      const promptName = `text-prompt-${nanoid()}`;

      const result = (await handleCreateTextPrompt(
        {
          name: promptName,
          prompt: "Production prompt",
          labels: ["production", "stable"],
        },
        context,
      )) as {
        labels: string[];
        message: string;
      };

      expect(result.labels).toEqual(
        expect.arrayContaining(["production", "stable"]),
      );
      expect(result.message).toContain("production");
    });

    it("should create text prompt with config", async () => {
      const { context } = await createMcpTestSetup();
      const promptName = `text-prompt-${nanoid()}`;

      const result = (await handleCreateTextPrompt(
        {
          name: promptName,
          prompt: "Test with config",
          config: { model: "gpt-4", temperature: 0.7 },
        },
        context,
      )) as {
        config: Record<string, unknown>;
      };

      expect(result.config).toEqual({ model: "gpt-4", temperature: 0.7 });
    });

    it("should create text prompt with tags", async () => {
      const { context } = await createMcpTestSetup();
      const promptName = `text-prompt-${nanoid()}`;

      const result = (await handleCreateTextPrompt(
        {
          name: promptName,
          prompt: "Test with tags",
          tags: ["experimental", "v2"],
        },
        context,
      )) as {
        tags: string[];
      };

      expect(result.tags).toEqual(["experimental", "v2"]);
    });

    it("should create text prompt with commit message", async () => {
      const { context } = await createMcpTestSetup();
      const promptName = `text-prompt-${nanoid()}`;

      const result = (await handleCreateTextPrompt(
        {
          name: promptName,
          prompt: "Test with commit message",
          commitMessage: "Initial production version",
        },
        context,
      )) as {
        id: string;
      };

      // Verify the commit message is stored
      const prompt = await prisma.prompt.findUnique({
        where: { id: result.id },
      });
      expect(prompt?.commitMessage).toBe("Initial production version");
    });

    it("should auto-increment version for same prompt name", async () => {
      const { context } = await createMcpTestSetup();
      const promptName = `text-prompt-${nanoid()}`;

      // Create first version
      const result1 = (await handleCreateTextPrompt(
        {
          name: promptName,
          prompt: "Version 1",
        },
        context,
      )) as { version: number };

      // Create second version
      const result2 = (await handleCreateTextPrompt(
        {
          name: promptName,
          prompt: "Version 2",
        },
        context,
      )) as { version: number };

      expect(result1.version).toBe(1);
      expect(result2.version).toBe(2);
    });

    it("should create audit log entry", async () => {
      const { context, projectId, apiKeyId } = await createMcpTestSetup();
      const promptName = `text-prompt-${nanoid()}`;

      const result = (await handleCreateTextPrompt(
        {
          name: promptName,
          prompt: "Audited prompt",
        },
        context,
      )) as { id: string };

      const auditLogEntry = await verifyAuditLog({
        projectId,
        resourceType: "prompt",
        resourceId: result.id,
        action: "create",
        apiKeyId,
      });

      expect(auditLogEntry.after).toBeDefined();
      expect(auditLogEntry.before).toBeNull();
    });

    it("should use context.projectId for tenant isolation", async () => {
      const { context: context1, projectId: projectId1 } =
        await createMcpTestSetup();

      const promptName = `isolated-${nanoid()}`;

      // Create prompt in project 1
      const result1 = (await handleCreateTextPrompt(
        {
          name: promptName,
          prompt: "Project 1 prompt",
        },
        context1,
      )) as { id: string };

      // Verify it's in project 1
      const prompt = await prisma.prompt.findUnique({
        where: { id: result1.id },
      });
      expect(prompt?.projectId).toBe(projectId1);
    });

    it("should support template variables in prompt", async () => {
      const { context } = await createMcpTestSetup();
      const promptName = `text-prompt-${nanoid()}`;

      const result = (await handleCreateTextPrompt(
        {
          name: promptName,
          prompt: "Hello {{name}}, welcome to {{service}}!",
        },
        context,
      )) as { id: string };

      const prompt = await prisma.prompt.findUnique({
        where: { id: result.id },
      });
      expect(prompt?.prompt).toBe("Hello {{name}}, welcome to {{service}}!");
    });

    it("should ignore 'latest' in user-provided labels (auto-managed)", async () => {
      const { context } = await createMcpTestSetup();
      const promptName = `text-prompt-${nanoid()}`;

      // 'latest' is auto-managed, so if user provides it, it's ignored
      // but the system will still add 'latest' automatically
      const result = (await handleCreateTextPrompt(
        {
          name: promptName,
          prompt: "Test",
          labels: ["latest", "production"],
        },
        context,
      )) as { labels: string[] };

      // Should have 'latest' (auto) and 'production' (user-provided)
      expect(result.labels).toContain("latest");
      expect(result.labels).toContain("production");
    });

    it("should set createdBy to API", async () => {
      const { context } = await createMcpTestSetup();
      const promptName = `text-prompt-${nanoid()}`;

      const result = (await handleCreateTextPrompt(
        {
          name: promptName,
          prompt: "Test",
        },
        context,
      )) as { createdBy: string };

      expect(result.createdBy).toBe("API");
    });
  });

  describe("createChatPrompt tool", () => {
    it("should create a simple chat prompt", async () => {
      const { context } = await createMcpTestSetup();
      const promptName = `chat-prompt-${nanoid()}`;

      const result = (await handleCreateChatPrompt(
        {
          name: promptName,
          prompt: [
            { role: "system", content: "You are a helpful assistant." },
            { role: "user", content: "Help me with {{task}}" },
          ],
        },
        context,
      )) as {
        id: string;
        name: string;
        version: number;
        type: string;
        labels: string[];
        message: string;
      };

      expect(result.id).toBeDefined();
      expect(result.name).toBe(promptName);
      expect(result.version).toBe(1);
      expect(result.type).toBe("chat");
      // First version automatically gets 'latest' label
      expect(result.labels).toContain("latest");
      expect(result.message).toContain("Successfully created");
    });

    it("should create chat prompt with labels", async () => {
      const { context } = await createMcpTestSetup();
      const promptName = `chat-prompt-${nanoid()}`;

      const result = (await handleCreateChatPrompt(
        {
          name: promptName,
          prompt: [{ role: "system", content: "System instruction" }],
          labels: ["production"],
        },
        context,
      )) as {
        labels: string[];
      };

      expect(result.labels).toContain("production");
    });

    it("should create chat prompt with multiple message roles", async () => {
      const { context } = await createMcpTestSetup();
      const promptName = `chat-prompt-${nanoid()}`;

      const messages = [
        { role: "system", content: "You are an expert." },
        { role: "user", content: "What is {{topic}}?" },
        { role: "assistant", content: "I will explain {{topic}}." },
      ];

      const result = (await handleCreateChatPrompt(
        {
          name: promptName,
          prompt: messages,
        },
        context,
      )) as { id: string };

      const prompt = await prisma.prompt.findUnique({
        where: { id: result.id },
      });

      expect(prompt?.prompt).toEqual(messages);
    });

    it("should create chat prompt with config", async () => {
      const { context } = await createMcpTestSetup();
      const promptName = `chat-prompt-${nanoid()}`;

      const result = (await handleCreateChatPrompt(
        {
          name: promptName,
          prompt: [{ role: "system", content: "Test" }],
          config: { model: "gpt-4-turbo", maxTokens: 1000 },
        },
        context,
      )) as {
        config: Record<string, unknown>;
      };

      expect(result.config).toEqual({ model: "gpt-4-turbo", maxTokens: 1000 });
    });

    it("should create chat prompt with tags", async () => {
      const { context } = await createMcpTestSetup();
      const promptName = `chat-prompt-${nanoid()}`;

      const result = (await handleCreateChatPrompt(
        {
          name: promptName,
          prompt: [{ role: "system", content: "Test" }],
          tags: ["multi-turn", "conversational"],
        },
        context,
      )) as {
        tags: string[];
      };

      expect(result.tags).toEqual(["multi-turn", "conversational"]);
    });

    it("should auto-increment version for same prompt name", async () => {
      const { context } = await createMcpTestSetup();
      const promptName = `chat-prompt-${nanoid()}`;

      const result1 = (await handleCreateChatPrompt(
        {
          name: promptName,
          prompt: [{ role: "system", content: "V1" }],
        },
        context,
      )) as { version: number };

      const result2 = (await handleCreateChatPrompt(
        {
          name: promptName,
          prompt: [{ role: "system", content: "V2" }],
        },
        context,
      )) as { version: number };

      expect(result1.version).toBe(1);
      expect(result2.version).toBe(2);
    });

    it("should create audit log entry", async () => {
      const { context, projectId, apiKeyId } = await createMcpTestSetup();
      const promptName = `chat-prompt-${nanoid()}`;

      const result = (await handleCreateChatPrompt(
        {
          name: promptName,
          prompt: [{ role: "system", content: "Audited" }],
        },
        context,
      )) as { id: string };

      const auditLogEntry = await verifyAuditLog({
        projectId,
        resourceType: "prompt",
        resourceId: result.id,
        action: "create",
        apiKeyId,
      });

      expect(auditLogEntry.after).toBeDefined();
      expect(auditLogEntry.before).toBeNull();
    });

    it("should use context.projectId for tenant isolation", async () => {
      const { context: context1, projectId: projectId1 } =
        await createMcpTestSetup();

      const promptName = `isolated-chat-${nanoid()}`;

      const result = (await handleCreateChatPrompt(
        {
          name: promptName,
          prompt: [{ role: "system", content: "Project 1" }],
        },
        context1,
      )) as { id: string };

      const prompt = await prisma.prompt.findUnique({
        where: { id: result.id },
      });
      expect(prompt?.projectId).toBe(projectId1);
    });

    it("should support template variables in messages", async () => {
      const { context } = await createMcpTestSetup();
      const promptName = `chat-prompt-${nanoid()}`;

      const result = (await handleCreateChatPrompt(
        {
          name: promptName,
          prompt: [
            { role: "system", content: "You are a {{domain}} expert." },
            { role: "user", content: "Explain {{concept}} to me." },
          ],
        },
        context,
      )) as { id: string };

      const prompt = await prisma.prompt.findUnique({
        where: { id: result.id },
      });

      const messages = prompt?.prompt as Array<{
        role: string;
        content: string;
      }>;
      expect(messages[0].content).toContain("{{domain}}");
      expect(messages[1].content).toContain("{{concept}}");
    });

    it("should reject empty message array", async () => {
      const { context } = await createMcpTestSetup();
      const promptName = `chat-prompt-${nanoid()}`;

      // Empty array is now rejected - chat prompts need at least one message
      await expect(
        handleCreateChatPrompt(
          {
            name: promptName,
            prompt: [],
          },
          context,
        ),
      ).rejects.toMatchObject({
        code: -32602, // INVALID_PARAMS
        message: expect.stringContaining(
          "Chat prompts must have at least one message",
        ),
      });
    });

    it("should set createdBy to API", async () => {
      const { context } = await createMcpTestSetup();
      const promptName = `chat-prompt-${nanoid()}`;

      const result = (await handleCreateChatPrompt(
        {
          name: promptName,
          prompt: [{ role: "system", content: "Test" }],
        },
        context,
      )) as { createdBy: string };

      expect(result.createdBy).toBe("API");
    });
  });

  describe("updatePromptLabels tool", () => {
    it("should update labels for a prompt version", async () => {
      const { context, projectId } = await createMcpTestSetup();
      const promptName = `update-labels-${nanoid()}`;

      await createPromptInDb({
        name: promptName,
        prompt: "Test",
        projectId,
        labels: [],
        version: 1,
      });

      const result = (await handleUpdatePromptLabels(
        {
          name: promptName,
          version: 1,
          newLabels: ["production"],
        },
        context,
      )) as {
        id: string;
        name: string;
        version: number;
        labels: string[];
        message: string;
      };

      expect(result.name).toBe(promptName);
      expect(result.version).toBe(1);
      expect(result.labels).toContain("production");
      expect(result.message).toContain("Successfully updated");
    });

    it("should remove labels from other versions (label uniqueness)", async () => {
      const { context, projectId } = await createMcpTestSetup();
      const promptName = `label-unique-${nanoid()}`;

      // Create v1 with production label
      await createPromptInDb({
        name: promptName,
        prompt: "V1",
        projectId,
        labels: ["production"],
        version: 1,
      });

      // Create v2 without labels
      await createPromptInDb({
        name: promptName,
        prompt: "V2",
        projectId,
        labels: [],
        version: 2,
      });

      // Move production to v2
      await handleUpdatePromptLabels(
        {
          name: promptName,
          version: 2,
          newLabels: ["production"],
        },
        context,
      );

      // Verify v1 no longer has production
      const v1 = await prisma.prompt.findFirst({
        where: { projectId, name: promptName, version: 1 },
      });
      expect(v1?.labels).not.toContain("production");

      // Verify v2 now has production
      const v2 = await prisma.prompt.findFirst({
        where: { projectId, name: promptName, version: 2 },
      });
      expect(v2?.labels).toContain("production");
    });

    it("should allow setting multiple labels", async () => {
      const { context, projectId } = await createMcpTestSetup();
      const promptName = `multi-labels-${nanoid()}`;

      await createPromptInDb({
        name: promptName,
        prompt: "Test",
        projectId,
        labels: [],
        version: 1,
      });

      const result = (await handleUpdatePromptLabels(
        {
          name: promptName,
          version: 1,
          newLabels: ["staging", "testing", "qa"],
        },
        context,
      )) as {
        labels: string[];
      };

      expect(result.labels).toEqual(
        expect.arrayContaining(["staging", "testing", "qa"]),
      );
    });

    it("should add new labels to existing labels (additive behavior)", async () => {
      const { context } = await createMcpTestSetup();
      const promptName = `add-labels-${nanoid()}`;

      // Create via handler so it gets 'latest' automatically
      const created = (await handleCreateTextPrompt(
        {
          name: promptName,
          prompt: "Test",
          labels: ["production"],
        },
        context,
      )) as { version: number; labels: string[] };

      expect(created.labels).toContain("production");
      expect(created.labels).toContain("latest");

      // The updatePromptLabels action ADDS labels, not replaces them
      const result = (await handleUpdatePromptLabels(
        {
          name: promptName,
          version: created.version,
          newLabels: ["staging"],
        },
        context,
      )) as {
        labels: string[];
        message: string;
      };

      // Should have all labels: original + new
      expect(result.labels).toContain("latest");
      expect(result.labels).toContain("production");
      expect(result.labels).toContain("staging");
    });

    it("should throw error for non-existent prompt", async () => {
      const { context } = await createMcpTestSetup();

      await expect(
        handleUpdatePromptLabels(
          {
            name: "non-existent",
            version: 1,
            newLabels: ["production"],
          },
          context,
        ),
      ).rejects.toThrow(/not found/i);
    });

    it("should throw error for non-existent version", async () => {
      const { context, projectId } = await createMcpTestSetup();
      const promptName = `version-check-${nanoid()}`;

      await createPromptInDb({
        name: promptName,
        prompt: "Test",
        projectId,
        version: 1,
      });

      await expect(
        handleUpdatePromptLabels(
          {
            name: promptName,
            version: 999,
            newLabels: ["production"],
          },
          context,
        ),
      ).rejects.toThrow(/not found/i);
    });

    it("should create audit log entry with before and after states", async () => {
      const { context, projectId, apiKeyId } = await createMcpTestSetup();
      const promptName = `audit-update-${nanoid()}`;

      // Create via handler to get proper structure
      const created = (await handleCreateTextPrompt(
        {
          name: promptName,
          prompt: "Test",
          labels: ["staging"],
        },
        context,
      )) as { version: number };

      const result = (await handleUpdatePromptLabels(
        {
          name: promptName,
          version: created.version,
          newLabels: ["qa"],
        },
        context,
      )) as { id: string };

      const auditLogEntry = await verifyAuditLog({
        projectId,
        resourceType: "prompt",
        resourceId: result.id,
        action: "update",
        apiKeyId,
      });

      expect(auditLogEntry.before).toBeDefined();
      expect(auditLogEntry.after).toBeDefined();

      // Audit log stores JSON strings - parse them
      const beforeState =
        typeof auditLogEntry.before === "string"
          ? (JSON.parse(auditLogEntry.before) as Record<string, unknown>)
          : (auditLogEntry.before as Record<string, unknown>);
      const afterState =
        typeof auditLogEntry.after === "string"
          ? (JSON.parse(auditLogEntry.after) as Record<string, unknown>)
          : (auditLogEntry.after as Record<string, unknown>);

      // Verify the before and after are different and contain labels
      expect(beforeState).toHaveProperty("labels");
      expect(afterState).toHaveProperty("labels");
      // Should have the new label added
      expect(afterState.labels).toContain("qa");
      // Should preserve original labels (additive behavior)
      expect(afterState.labels).toContain("staging");
    });

    it("should use context.projectId for tenant isolation", async () => {
      const { context: context1, projectId: projectId1 } =
        await createMcpTestSetup();
      const { context: context2 } = await createMcpTestSetup();

      const promptName = `isolated-update-${nanoid()}`;

      // Create prompt in project 1
      await createPromptInDb({
        name: promptName,
        prompt: "Project 1",
        projectId: projectId1,
        version: 1,
      });

      // Project 2 should not be able to update it
      await expect(
        handleUpdatePromptLabels(
          {
            name: promptName,
            version: 1,
            newLabels: ["production"],
          },
          context2,
        ),
      ).rejects.toThrow(/not found/i);

      // Project 1 should be able to update it
      const result = await handleUpdatePromptLabels(
        {
          name: promptName,
          version: 1,
          newLabels: ["production"],
        },
        context1,
      );

      expect(result).toBeDefined();
    });

    it("should reject 'latest' label", async () => {
      const { context, projectId } = await createMcpTestSetup();
      const promptName = `latest-reject-${nanoid()}`;

      await createPromptInDb({
        name: promptName,
        prompt: "Test",
        projectId,
        version: 1,
      });

      // 'latest' is auto-managed and cannot be set manually
      await expect(
        handleUpdatePromptLabels(
          {
            name: promptName,
            version: 1,
            newLabels: ["latest"],
          },
          context,
        ),
      ).rejects.toThrow();
    });

    it("should handle special characters in prompt name", async () => {
      const { context, projectId } = await createMcpTestSetup();
      const promptName = `special!@#$-${nanoid()}`;

      await createPromptInDb({
        name: promptName,
        prompt: "Test",
        projectId,
        version: 1,
      });

      const result = (await handleUpdatePromptLabels(
        {
          name: promptName,
          version: 1,
          newLabels: ["production"],
        },
        context,
      )) as { name: string };

      expect(result.name).toBe(promptName);
    });
  });
});
